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
//  * A transfer that definitely failed releases its ledger rows so the money is
//    owed again. A transfer whose outcome is unknown (network trouble) stays
//    "pending" and is retried with the same key on the next run.

// Arbitrary fixed number naming "the payout run" lock.
const PAYOUT_LOCK_KEY = 7270027;

async function applyTransferResult(payoutId, result) {
  const status = result?.status === 'paid' ? 'paid' : result?.status === 'failed' ? 'failed' : 'pending';
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE payouts
       SET status = $2, provider_reference = COALESCE($3, provider_reference), updated_at = now()
       WHERE id = $1`,
      [payoutId, status, result?.providerReference ?? null]
    );
    if (status === 'failed') {
      // The money never left: owe it to the coach again.
      await client.query(`UPDATE commission_ledger SET payout_id = NULL WHERE payout_id = $1`, [payoutId]);
    }
  });
  return status;
}

// Payouts already started but not finished: ask how they went, or (if we never
// heard back) retry with the SAME key, which is safe.
async function settleInFlight(billing) {
  const { rows } = await pool.query(
    `SELECT p.id, p.amount_cents, p.provider_reference, cs.provider_account_id, cs.identity_verified
     FROM payouts p
     LEFT JOIN coach_subscriptions cs ON cs.coach_id = p.coach_id
     WHERE p.status = 'pending'
     ORDER BY p.created_at`
  );
  for (const payout of rows) {
    try {
      if (payout.provider_reference) {
        const result = await billing.getPayoutStatus({ providerReference: payout.provider_reference });
        await applyTransferResult(payout.id, { status: result?.status, providerReference: payout.provider_reference });
      } else if (payout.identity_verified && payout.provider_account_id) {
        const result = await billing.transferToCoach({
          idempotencyKey: payout.id,
          providerAccountId: payout.provider_account_id,
          amountCents: payout.amount_cents,
        });
        await applyTransferResult(payout.id, result);
      }
    } catch (err) {
      logger.error('Could not settle an in-flight payout', { payoutId: payout.id, error: err });
      if (err?.outcomeUnknown === false && !payout.provider_reference) {
        await applyTransferResult(payout.id, { status: 'failed' });
      }
    }
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

    const { rows: payoutRows } = await client.query(
      `INSERT INTO payouts (coach_id, amount_cents, status) VALUES ($1, $2, 'pending') RETURNING id`,
      [coachId, total]
    );
    await client.query(
      `UPDATE commission_ledger SET payout_id = $1 WHERE id = ANY($2::uuid[])`,
      [payoutRows[0].id, rowsOwed.map((row) => row.id)]
    );
    return { payoutId: payoutRows[0].id, amountCents: total, providerAccountId: accountRows[0].provider_account_id };
  });
}

// Runs the whole thing. Returns { busy: true } when another run holds the lock,
// otherwise { started, totalCents, failed }.
export async function runPayoutsMethodB() {
  const billing = getBillingClient();
  const lockClient = await pool.connect();
  try {
    const { rows: lock } = await lockClient.query('SELECT pg_try_advisory_lock($1::bigint) AS ok', [PAYOUT_LOCK_KEY]);
    if (!lock[0].ok) return { busy: true };
    try {
      await settleInFlight(billing);

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
          // A clear refusal (the money definitely did not move) frees the
          // ledger rows so the coach is owed it again. Anything unclear
          // (a timeout, a dropped connection) leaves the payout "pending"; the
          // next run retries it with the same key, which cannot pay twice.
          if (err?.outcomeUnknown === false) {
            await applyTransferResult(claim.payoutId, { status: 'failed' });
          }
        }
      }
      return { started, totalCents, failed };
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock($1::bigint)', [PAYOUT_LOCK_KEY]);
    }
  } finally {
    lockClient.release();
  }
}
