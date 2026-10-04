import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { getBillingClient } from './billing/index.js';
import { logger } from './logger.js';
import { withTransaction } from './withTransaction.js';

// "Pay coaches now" under Method B (Cut collects, then sends each coach their
// share). The rules that keep this from ever paying twice or paying the wrong
// person:
//
//  * One run at a time. A database-wide lock is held for the whole run; a
//    second click while one is running is told to wait and does nothing.
//  * The payout row is written FIRST, in the same step that claims the ledger
//    rows it covers (so no other run can claim them). Only then is money sent,
//    and the payout's own id is the payment company's idempotency key, so even
//    a retry of the same payout cannot move money twice.
//  * Nobody is paid without a passed identity check and a payment-company
//    account, and nobody is paid a zero or negative balance (refunds are
//    negative ledger rows that net off first).
//  * A revoked coach is paid like any other: revoking access does not forgive
//    a debt.
//  * A payout remembers the coach's payment account and the key it was FIRST
//    sent under. Every retry uses those, never the coach's current account.
//  * Money is released back to "owed" in only three cases: the payment company
//    itself says the transfer "failed"; a lookup by our own key finds NO
//    transfer at all (and we have waited long enough that a slow one would have
//    shown up); or the very first send of a brand-new payout is clearly refused.
//    Any other reply (a timeout, a "still working" 409, a duplicate or server
//    error) NEVER releases money: the payout stays "pending", is flagged for
//    the owner, and is checked again on the next run.
//  * Too old to trust (see MANUAL_REVIEW_AFTER_DAYS) it is parked as
//    "manual_review" with its money still held, and never retried by itself.
//    Before parking, and on every later run, a read-only lookup tries to settle
//    it; the owner can also mark it paid or failed by hand (resolveManualReviewPayout).

// Arbitrary fixed number naming "the payout run" lock.
const PAYOUT_LOCK_KEY = 7270027;

// The payment company only remembers a request key for about a day. After a few
// days an automatic retry can no longer PROVE whether the money already moved,
// so a payout still unconfirmed by then is parked for a human to check with the
// payment company. Its money stays held (it is never offered to the coach
// again, and never sent again) until someone settles it.
export const MANUAL_REVIEW_AFTER_DAYS = 3;

// A lookup that finds nothing is only believed once the payout is at least this
// old, so a slow transfer that is still being created is not mistaken for a
// transfer that never happened.
export const NOT_FOUND_GRACE_MINUTES = 10;

// Only a clear refusal from the payment company proves the money never moved,
// and it is only used for the very first send of a brand-new payout. A
// timeout, a dropped connection, a server error, or a "still working on that
// key" (409) could all hide a transfer that DID go through, so they are NOT
// clear: the payout stays pending.
const CLEAR_REFUSAL_STATUSES = new Set([400, 401, 403, 404, 422]);
function isClearRefusal(err) {
  return err?.outcomeUnknown === false && CLEAR_REFUSAL_STATUSES.has(err?.status);
}

async function applyTransferResult(payoutId, result) {
  const status = result?.status === 'paid' ? 'paid' : result?.status === 'failed' ? 'failed' : 'pending';
  await withTransaction(async (client) => {
    // Only a payout still waiting can be settled; a replay changes nothing. A
    // payout parked for review can be settled by a clear "paid" or "failed"
    // (never moved back to pending by an unclear answer).
    const { rowCount } = await client.query(
      `UPDATE payouts
       SET status = $2, provider_reference = COALESCE($3, provider_reference),
           attention = CASE WHEN $2 = 'pending' THEN attention ELSE NULL END, updated_at = now()
       WHERE id = $1 AND (status = 'pending' OR (status = 'manual_review' AND $2 <> 'pending'))`,
      [payoutId, status, result?.providerReference ?? null]
    );
    if (rowCount > 0 && status === 'failed') {
      // The money never left: owe it to the coach again.
      await client.query(`UPDATE commission_ledger SET payout_id = NULL WHERE payout_id = $1`, [payoutId]);
    }
  });
  return status;
}

// Keeps a payout pending and tells the owner why (see payouts.attention).
async function flagPayout(payoutId, attention) {
  await pool.query(
    `UPDATE payouts SET attention = $2, updated_at = now() WHERE id = $1 AND status = 'pending'`,
    [payoutId, attention]
  );
}

// The owner settles a payout parked for review, after checking with the payment
// company. 'failed' frees its ledger rows (exactly once, because only the call
// that really changes the status does it); 'paid' just marks it paid. Valid
// only from manual_review. Repeating the same answer is a harmless no-op.
// Returns 'resolved' | 'unchanged' (already settled the same way) | 'not_in_review' | 'not_found'.
export async function resolveManualReviewPayout(payoutId, outcome, note) {
  return withTransaction(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE payouts
       SET status = $2, resolution_note = $3, attention = NULL, updated_at = now()
       WHERE id = $1 AND status = 'manual_review'`,
      [payoutId, outcome, note]
    );
    if (rowCount > 0) {
      if (outcome === 'failed') {
        await client.query(`UPDATE commission_ledger SET payout_id = NULL WHERE payout_id = $1`, [payoutId]);
      }
      return 'resolved';
    }
    const { rows } = await client.query('SELECT status FROM payouts WHERE id = $1', [payoutId]);
    if (!rows[0]) return 'not_found';
    return rows[0].status === outcome ? 'unchanged' : 'not_in_review';
  });
}

// Parks a pending payout for a person; its money stays held.
async function parkPayout(payoutId) {
  await pool.query(
    `UPDATE payouts SET status = 'manual_review', attention = NULL, updated_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [payoutId]
  );
}

// Read-only look at how a payout went: by its transfer reference if we have
// one, otherwise by our own key and the original account. Moves no money. An
// error (or no answer) is NOT an answer: it returns null and releases nothing.
// Returns the status ('paid' | 'failed' | 'pending') or null when nothing
// could be found out.
async function lookupAndSettle(billing, payout) {
  try {
    if (payout.provider_reference) {
      const result = await billing.getPayoutStatus({ providerReference: payout.provider_reference });
      return await applyTransferResult(payout.id, { status: result?.status, providerReference: payout.provider_reference });
    }
    if (!payout.provider_account_id || !payout.idempotency_key) return null;
    const lookup = await billing.findTransferByKey({
      idempotencyKey: payout.idempotency_key,
      providerAccountId: payout.provider_account_id,
      amountCents: payout.amount_cents,
      createdAt: payout.created_at,
    });
    if (!lookup?.found) return null;
    return await applyTransferResult(payout.id, { status: lookup.status, providerReference: lookup.providerReference });
  } catch (err) {
    logger.error('Could not look up a payout with the payment company', { payoutId: payout.id, error: err });
    return null;
  }
}

// Payouts already started but not finished: ask how they went, or (if we never
// heard back) retry with the SAME key and the SAME coach account.
async function settleInFlight(billing) {
  const { rows } = await pool.query(
    `SELECT id, status, amount_cents, created_at, provider_reference, provider_account_id, idempotency_key,
            (created_at < now() - ($1::int * interval '1 minute')) AS old_enough_to_trust_not_found,
            (created_at < now() - ($2::int * interval '1 day')) AS too_old
     FROM payouts
     WHERE status IN ('pending', 'manual_review')
     ORDER BY created_at`,
    [NOT_FOUND_GRACE_MINUTES, MANUAL_REVIEW_AFTER_DAYS]
  );
  for (const payout of rows) {
    try {
      if (payout.status === 'manual_review') {
        // Parked, but looked at again every run: if the payment company can now
        // say how it went, it settles by itself. Otherwise it stays parked.
        await lookupAndSettle(billing, payout);
      } else if (payout.too_old && !payout.provider_reference) {
        // Too old to retry by machine. But look first: if the transfer exists,
        // settle it; only if we still cannot tell is it parked for a person.
        // (A payout with a known transfer reference is never parked: asking
        // about a known transfer is reliable at any age.)
        const settled = await lookupAndSettle(billing, payout);
        if (settled !== 'paid' && settled !== 'failed') await parkPayout(payout.id);
      } else {
        await settleOne(billing, payout);
      }
    } catch (err) {
      logger.error('Could not settle an in-flight payout', { payoutId: payout.id, error: err });
      await flagPayout(payout.id, 'unconfirmed_reply');
    }
  }
}

// A payout marked "not sent" (by the OWNER, or released by Cut itself after
// "lookup found nothing") is checked again, read-only, for 30 days. If the payment company says it WAS sent, the coach may be paid
// twice (the money was freed when it was marked failed), so it is only flagged
// for the owner: no money is changed here. The flag lives in `attention`, so a
// payout already flagged is not looked at or flagged again. Each press checks
// at most 25, the least-recently-checked first, so the number of calls to the
// payment company stays small and every payout gets its turn.
async function checkMarkedFailedPayouts(billing) {
  const { rows } = await pool.query(
    `SELECT id, amount_cents, created_at, provider_reference, provider_account_id, idempotency_key
     FROM payouts
     WHERE status = 'failed' AND attention IS NULL
       AND updated_at > now() - interval '30 days'
     ORDER BY recheck_at ASC NULLS FIRST, updated_at ASC
     LIMIT 25`
  );
  for (const payout of rows) {
    try {
      // Mark it as looked at first, so a payout whose check keeps failing
      // does not hog the front of the queue every time.
      await pool.query('UPDATE payouts SET recheck_at = now() WHERE id = $1', [payout.id]);
      let status = null;
      if (payout.provider_reference) {
        status = (await billing.getPayoutStatus({ providerReference: payout.provider_reference }))?.status;
      } else if (payout.provider_account_id && payout.idempotency_key) {
        const lookup = await billing.findTransferByKey({
          idempotencyKey: payout.idempotency_key,
          providerAccountId: payout.provider_account_id,
          amountCents: payout.amount_cents,
          createdAt: payout.created_at,
        });
        if (lookup?.found) status = lookup.status;
      }
      if (status === 'paid') {
        await pool.query(
          `UPDATE payouts SET attention = 'paid_after_marked_failed'
           WHERE id = $1 AND status = 'failed' AND attention IS NULL`,
          [payout.id]
        );
      }
    } catch (err) {
      logger.error('Could not re-check a payout marked as not sent', { payoutId: payout.id, error: err });
    }
  }
}

async function settleOne(billing, payout) {
  // We already know the transfer: just ask how it went. An error here proves
  // nothing, so the payout stays pending.
  if (payout.provider_reference) {
    try {
      const result = await billing.getPayoutStatus({ providerReference: payout.provider_reference });
      await applyTransferResult(payout.id, { status: result?.status, providerReference: payout.provider_reference });
    } catch (err) {
      logger.error('Could not check a payout with the payment company', { payoutId: payout.id, error: err });
      await flagPayout(payout.id, 'lookup_failed');
    }
    return;
  }
  const account = payout.provider_account_id;
  const key = payout.idempotency_key;
  if (!account || !key) {
    // Cannot retry safely without the original details.
    await flagPayout(payout.id, 'lookup_failed');
    return;
  }

  // 1. Did the original request go through? Look by the ORIGINAL key.
  let lookup;
  try {
    lookup = await billing.findTransferByKey({
      idempotencyKey: key,
      providerAccountId: account,
      amountCents: payout.amount_cents,
      createdAt: payout.created_at,
    });
  } catch (err) {
    // "Could not look" is NOT "not found".
    logger.error('Could not look up a payout with the payment company', { payoutId: payout.id, error: err });
    // A transfer without our reference near this payout's time may be ours:
    // tell the owner exactly that. Money stays held either way.
    await flagPayout(payout.id, err?.possibleMatch ? 'keyless_transfer_nearby' : 'lookup_failed');
    return;
  }
  if (lookup?.found) {
    await applyTransferResult(payout.id, { status: lookup.status, providerReference: lookup.providerReference });
    return;
  }

  // 2. Nothing there. After the waiting time that is trusted: the money never
  //    moved, so it is owed again (and the next step of this run pays it under
  //    a brand-new payout and key).
  if (payout.old_enough_to_trust_not_found) {
    await applyTransferResult(payout.id, { status: 'failed' });
    return;
  }

  // 3. Too soon to be sure: send again with the ORIGINAL key and account (the
  //    payment company treats a repeat of the same key as the same request).
  //    Whatever the error, money is NOT released: the payout stays pending.
  try {
    const result = await billing.transferToCoach({
      idempotencyKey: key,
      providerAccountId: account,
      amountCents: payout.amount_cents,
    });
    await applyTransferResult(payout.id, result);
  } catch (err) {
    logger.error('A payout retry did not complete; the money stays on hold', { payoutId: payout.id, error: err });
    await flagPayout(payout.id, 'unconfirmed_reply');
  }
}

// Claims everything owed to one coach and records the payout, in one step.
// Returns null when there is nothing to pay.
async function claimForCoach(coachId) {
  return withTransaction(async (client) => {
    const { rows: rowsOwed } = await client.query(
      `SELECT id, coach_cents FROM commission_ledger
       WHERE coach_id = $1 AND settled_by = 'cut' AND payout_id IS NULL
       FOR UPDATE`,
      [coachId]
    );
    const total = rowsOwed.reduce((sum, row) => sum + row.coach_cents, 0);
    if (total <= 0) return null;

    const { rows: accountRows } = await client.query(
      `SELECT provider_account_id FROM coach_subscriptions
       WHERE coach_id = $1 AND identity_verified = true AND provider_account_id IS NOT NULL
       FOR SHARE`,
      [coachId]
    );
    if (!accountRows[0]) return null;

    // The payout's id doubles as the payment company's key. Both it and the
    // coach's account are saved on the row so a retry uses exactly these.
    const payoutId = randomUUID();
    const providerAccountId = accountRows[0].provider_account_id;
    await client.query(
      `INSERT INTO payouts (id, coach_id, amount_cents, status, provider_account_id, idempotency_key)
       VALUES ($1::uuid, $2, $3, 'pending', $4, $5::text)`,
      [payoutId, coachId, total, providerAccountId, payoutId]
    );
    await client.query(
      `UPDATE commission_ledger SET payout_id = $1 WHERE id = ANY($2::uuid[])`,
      [payoutId, rowsOwed.map((row) => row.id)]
    );
    return { payoutId, amountCents: total, providerAccountId };
  });
}

// Runs the whole thing. Returns { busy: true } when another run holds the lock,
// otherwise { started, totalCents, failed }.
export async function runPayoutsMethodB() {
  const billing = getBillingClient();
  const lockClient = await pool.connect();
  // If the lock can't be released cleanly, the connection is destroyed (which
  // also drops the lock) instead of going back to the pool still holding it.
  let destroyLockClient = false;
  try {
    const { rows: lock } = await lockClient.query('SELECT pg_try_advisory_lock($1::bigint) AS ok', [PAYOUT_LOCK_KEY]);
    if (!lock[0].ok) return { busy: true };
    try {
      await settleInFlight(billing);
      await checkMarkedFailedPayouts(billing);

      const { rows: candidates } = await pool.query(
        `SELECT l.coach_id
         FROM commission_ledger l
         JOIN coach_subscriptions cs ON cs.coach_id = l.coach_id
           AND cs.identity_verified = true AND cs.provider_account_id IS NOT NULL
         WHERE l.settled_by = 'cut' AND l.payout_id IS NULL
         GROUP BY l.coach_id
         HAVING SUM(l.coach_cents) > 0`
      );

      let started = 0;
      let totalCents = 0;
      let failed = 0;
      for (const { coach_id: coachId } of candidates) {
        const claim = await claimForCoach(coachId);
        if (!claim) continue;
        try {
          const result = await billing.transferToCoach({
            idempotencyKey: claim.payoutId,
            providerAccountId: claim.providerAccountId,
            amountCents: claim.amountCents,
          });
          const status = await applyTransferResult(claim.payoutId, result);
          if (status === 'failed') {
            failed += 1;
          } else {
            started += 1;
            totalCents += claim.amountCents;
          }
        } catch (err) {
          failed += 1;
          logger.error('A payout transfer did not complete', { payoutId: claim.payoutId, error: err });
          // Only a clear refusal on this FIRST send of a brand-new payout (the
          // money definitely did not move) frees the ledger rows. Anything
          // unclear (a timeout, 409, duplicate or server error) keeps the
          // money held, flags it for the owner, and leaves the payout
          // "pending" for the next run to settle with the same key and account.
          if (isClearRefusal(err)) {
            await applyTransferResult(claim.payoutId, { status: 'failed' });
          } else {
            await flagPayout(claim.payoutId, 'unconfirmed_reply');
          }
        }
      }
      return { started, totalCents, failed };
    } finally {
      try {
        await lockClient.query('SELECT pg_advisory_unlock($1::bigint)', [PAYOUT_LOCK_KEY]);
      } catch (err) {
        destroyLockClient = true;
        logger.error('Could not release the payout run lock; closing its connection', { error: err });
      }
    }
  } finally {
    lockClient.release(destroyLockClient);
  }
}
