import { pool } from '../db/pool.js';
import { payoutMethod } from './billing/index.js';
import { computeCommission, reverseCommission } from './commission.js';
import { payingStudentCount } from './coachMoney.js';
import { logger } from './logger.js';
import { cancelSubscriptionSafely, refundPaymentSafely } from './providerRetries.js';
import { isUuid } from './validate.js';
import { withTransaction } from './withTransaction.js';

// Turns a VERIFIED payment-company message into changes in our own tables.
// The route has already checked the signature; nothing here trusts anything
// else. Four safety rules run through every function:
//
//  1. Exactly once. The whole message runs in ONE transaction that starts by
//     recording the message's id; a repeat delivery finds the id and does
//     nothing. On top of that every money row is INSERT ... ON CONFLICT
//     (source_ref) DO NOTHING, so even a repeat under a different message id
//     cannot add a second ledger row.
//  2. Access only ever switches ON from a verified payment or subscription
//     message (a student's coaching link, the AI plan).
//  3. A failed renewal keeps access while the payment company retries.
//  4. Whole cents only, rate stored on each row.

const LIVE_LINK_STATUSES = ['pending_payment', 'active'];

function cleanUuid(value) {
  return typeof value === 'string' && isUuid(value) ? value : null;
}

function positiveCents(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function asInterval(value) {
  return value === 'year' ? 'year' : 'month';
}

async function userExists(client, id) {
  if (!id) return false;
  const { rowCount } = await client.query('SELECT 1 FROM users WHERE id = $1::uuid', [id]);
  return rowCount > 0;
}

// Finds the stored subscription this message is about, if we have one.
async function findStoredSubscription(client, event, { userId, kind, linkId }) {
  if (event.providerSubscriptionId) {
    const { rows } = await client.query(
      'SELECT * FROM student_subscriptions WHERE provider_subscription_id = $1',
      [event.providerSubscriptionId]
    );
    if (rows[0]) return rows[0];
  }
  if (userId && kind === 'ai_plan') {
    const { rows } = await client.query(
      `SELECT * FROM student_subscriptions WHERE user_id = $1::uuid AND kind = 'ai_plan' AND status <> 'ended'`,
      [userId]
    );
    return rows[0] ?? null;
  }
  if (linkId && kind === 'coach') {
    const { rows } = await client.query(
      `SELECT * FROM student_subscriptions WHERE coach_client_id = $1::uuid AND kind = 'coach' AND status <> 'ended'`,
      [linkId]
    );
    return rows[0] ?? null;
  }
  return null;
}

// Works out who and what a message is about: its own metadata first, then
// whatever we stored when the subscription began (renewals may carry less).
async function resolveContext(client, event) {
  const meta = event.metadata ?? {};
  let kind = meta.kind === 'coach_student' ? 'coach' : meta.kind === 'ai_plan' ? 'ai_plan' : null;
  let userId = cleanUuid(meta.userId);
  let linkId = cleanUuid(meta.linkId);
  let coachUserId = cleanUuid(meta.coachUserId);
  let interval = meta.interval ? asInterval(meta.interval) : null;

  let stored = null;
  if (event.providerSubscriptionId) {
    stored = await findStoredSubscription(client, event, { userId, kind, linkId });
    if (stored) {
      kind = kind ?? stored.kind;
      userId = userId ?? stored.user_id;
      linkId = linkId ?? stored.coach_client_id;
      interval = interval ?? stored.interval;
    }
  }

  // A coaching link is the source of truth for who the coach is.
  let link = null;
  if (kind === 'coach') {
    if (linkId) {
      const { rows } = await client.query(
        'SELECT id, coach_id, client_id, status, replaces_link_id FROM coach_clients WHERE id = $1::uuid',
        [linkId]
      );
      link = rows[0] ?? null;
    }
    if (!link && userId && coachUserId) {
      const { rows } = await client.query(
        `SELECT id, coach_id, client_id, status, replaces_link_id FROM coach_clients
         WHERE client_id = $1::uuid AND coach_id = $2::uuid AND status = ANY($3::text[])`,
        [userId, coachUserId, LIVE_LINK_STATUSES]
      );
      link = rows[0] ?? null;
    }
    if (link) {
      // The link has to be this student's and (if the message names one) this coach's.
      if ((userId && link.client_id !== userId) || (coachUserId && link.coach_id !== coachUserId)) {
        logger.warn('Payment message does not match its coaching link; ignored');
        return null;
      }
      userId = userId ?? link.client_id;
      coachUserId = link.coach_id;
    }
  }

  return { kind, userId, linkId: link?.id ?? null, link, coachUserId, interval: interval ?? 'month', stored };
}

// Creates or updates the subscription row for a coach or AI plan.
async function saveSubscription(client, event, ctx, { status = 'active' } = {}) {
  const price = positiveCents(event.amountCents) ?? ctx.stored?.price_cents ?? 0;
  if (ctx.stored) {
    // Never bring an ended subscription back from a payment message.
    const nextStatus = ctx.stored.status === 'ended' ? 'ended' : status;
    const { rows } = await client.query(
      `UPDATE student_subscriptions
       SET status = $2,
           provider_subscription_id = COALESCE(provider_subscription_id, $3),
           provider_customer_id = COALESCE($4, provider_customer_id),
           current_period_end = COALESCE($5::timestamptz, current_period_end),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [ctx.stored.id, nextStatus, event.providerSubscriptionId ?? null, event.providerCustomerId ?? null, event.periodEnd ?? null]
    );
    return rows[0];
  }
  const { rows } = await client.query(
    `INSERT INTO student_subscriptions
       (user_id, coach_client_id, kind, interval, price_cents, provider_subscription_id,
        provider_customer_id, status, current_period_end)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::timestamptz)
     RETURNING *`,
    [
      ctx.userId, ctx.linkId, ctx.kind, ctx.interval, price,
      event.providerSubscriptionId ?? null, event.providerCustomerId ?? null, status, event.periodEnd ?? null,
    ]
  );
  return rows[0];
}

// A coach's link goes live: the one place a paid link becomes 'active'.
// Returns 'blocked' when the one-active-coach rule stopped it (the student
// already has another active coach), otherwise 'ok'.
async function activateCoachLink(client, link, tasks) {
  if (!link || link.status !== 'pending_payment') return 'ok';
  await client.query('SAVEPOINT activate_link');
  const switchTasks = [];
  try {
    // A student who switched coach keeps the old coach until now: only the new
    // coach's PAID subscription ends the old link, and the old subscription's
    // renewal is cancelled (after this step has saved). The old subscription
    // is only touched when the old link was really still active, so a replay
    // or a second message about the same payment changes nothing.
    if (link.replaces_link_id) {
      const { rowCount } = await client.query(
        `UPDATE coach_clients SET status = 'ended', ended_at = now()
         WHERE id = $1 AND client_id = $2 AND status = 'active'`,
        [link.replaces_link_id, link.client_id]
      );
      if (rowCount > 0) {
        const { rows: oldSubs } = await client.query(
          `SELECT id, provider_subscription_id FROM student_subscriptions
           WHERE coach_client_id = $1 AND kind = 'coach' AND status <> 'ended' AND cancel_at_period_end = false`,
          [link.replaces_link_id]
        );
        for (const old of oldSubs) {
          await planCancel(client, switchTasks, old.provider_subscription_id, old.id, 'student switched to a new coach');
        }
      }
    }
    await client.query(
      `UPDATE coach_clients SET status = 'active' WHERE id = $1 AND status = 'pending_payment'`,
      [link.id]
    );
    // Now they have a coach, their other open requests are withdrawn.
    await client.query(
      `UPDATE coach_clients SET status = 'declined'
       WHERE client_id = $1 AND id <> $2
         AND ((status = 'requested' AND requested_by IN ('client', 'referral')) OR status = 'pending_payment')`,
      [link.client_id, link.id]
    );
  } catch (err) {
    // The one-active-coach rule caught a clash (the student got another coach
    // while paying). The caller refunds the payment automatically.
    if (err.code !== '23505') throw err;
    await client.query('ROLLBACK TO SAVEPOINT activate_link');
    logger.warn('A paid coaching link could not go live: the student already has an active coach');
    await client.query('RELEASE SAVEPOINT activate_link');
    return 'blocked';
  }
  await client.query('RELEASE SAVEPOINT activate_link');
  tasks.push(...switchTasks);
  return 'ok';
}

// Subscriptions to stop at the payment company. They are collected during the
// message and only acted on AFTER the database work has committed (no network
// call while a transaction is open). `rowId` is our stored subscription row,
// if there is one, so it can be marked "cancels at period end" once stopped.
//
// The cancel is SAVED (pending_cancels) in the same transaction as the message,
// so it can never be lost between "committed" and "cancel sent": if the call
// after commit never happens (a crash, a restart), the saved row is still
// there for the retry. A successful cancel deletes the row. A subscription
// with no payment-company id (a free link) has nothing to stop over there:
// ours is just marked as cancelling, inside the same transaction.
async function planCancel(client, tasks, providerSubscriptionId, rowId, why) {
  if (!providerSubscriptionId) {
    if (rowId) {
      await client.query(
        `UPDATE student_subscriptions SET cancel_at_period_end = true, updated_at = now() WHERE id = $1`,
        [rowId]
      );
    }
    return;
  }
  await client.query(
    `INSERT INTO pending_cancels (provider_subscription_id, subscription_id, reason, attempts)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (provider_subscription_id) DO UPDATE
     SET subscription_id = COALESCE(pending_cancels.subscription_id, EXCLUDED.subscription_id),
         updated_at = now()`,
    [providerSubscriptionId, rowId ?? null, why ?? null]
  );
  tasks.push({ type: 'cancel', providerSubscriptionId, rowId: rowId ?? null, why });
}

// Runs the saved-up network calls (cancels and refunds). Each one is safe to
// fail: a cancel that does not go through is saved as "pending" and retried
// later, and a refund stays in pending_refunds, both visible to the owner. The
// log lines only say a thing happened after it really did.
async function runProviderTasks(tasks) {
  for (const task of tasks) {
    if (task.type === 'refund') {
      await refundPaymentSafely({ providerPaymentId: task.providerPaymentId });
    } else {
      const done = await cancelSubscriptionSafely({
        providerSubscriptionId: task.providerSubscriptionId,
        subscriptionId: task.rowId,
        reason: task.why,
      });
      if (done) logger.info('Stopped a subscription at the payment company', { why: task.why, subscriptionRow: task.rowId });
    }
  }
}

async function activateAiPlan(client, userId, customerId) {
  await client.query(
    `UPDATE users SET plan_tier = 'premium', provider_customer_id = COALESCE($2, provider_customer_id)
     WHERE id = $1::uuid`,
    [userId, customerId ?? null]
  );
}

// Writes one ledger row; a repeat of the same source_ref changes nothing.
async function writeLedger(client, row) {
  await client.query(
    `INSERT INTO commission_ledger
       (coach_id, student_id, gross_cents, commission_cents, coach_cents, rate_bps,
        period_start, period_end, source_ref, kind, original_ref, settled_by, owner_flag)
     VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9, $10, $11, $12, $13)
     ON CONFLICT (source_ref) DO NOTHING`,
    [
      row.coachId, row.studentId, row.grossCents, row.commissionCents, row.coachCents, row.rateBps,
      row.periodStart ?? null, row.periodEnd ?? null, row.sourceRef, row.kind, row.originalRef ?? null, row.settledBy,
      row.ownerFlag ?? null,
    ]
  );
}

// True when this message is about a provider subscription different from the
// one already stored for the same coaching link.
function isExtraSubscription(ctx, event) {
  const known = ctx.stored?.provider_subscription_id;
  return Boolean(known && event.providerSubscriptionId && known !== event.providerSubscriptionId);
}

// Is there a saved, not-yet-confirmed cancel for this payment-company subscription?
async function hasPendingCancel(client, providerSubscriptionId) {
  if (!providerSubscriptionId) return false;
  const { rowCount } = await client.query(
    'SELECT 1 FROM pending_cancels WHERE provider_subscription_id = $1',
    [providerSubscriptionId]
  );
  return rowCount > 0;
}

function settledByNow() {
  return payoutMethod() === 'A' ? 'provider' : 'cut';
}

async function onPaymentSucceeded(client, event, tasks) {
  const meta = event.metadata ?? {};

  if (meta.kind === 'coach_startup_fee') {
    const coachId = cleanUuid(meta.userId);
    if (!(await userExists(client, coachId))) return;
    await client.query(
      `INSERT INTO coach_subscriptions (coach_id, startup_fee_paid_at, startup_fee_payment_id)
       VALUES ($1::uuid, now(), $2)
       ON CONFLICT (coach_id) DO UPDATE
       SET startup_fee_paid_at = COALESCE(coach_subscriptions.startup_fee_paid_at, now()),
           startup_fee_payment_id = COALESCE(coach_subscriptions.startup_fee_payment_id, $2),
           updated_at = now()`,
      [coachId, event.providerPaymentId ?? event.providerEventRef ?? null]
    );
    return;
  }

  const ctx = await resolveContext(client, event);
  if (!ctx || !ctx.kind || !(await userExists(client, ctx.userId))) {
    logger.warn('Payment message could not be matched to anyone; ignored', { type: event.type });
    return;
  }

  if (ctx.kind === 'ai_plan') {
    const sub = await saveSubscription(client, event, ctx, { status: 'active' });
    if (sub.status !== 'ended') await activateAiPlan(client, ctx.userId, event.providerCustomerId);
    return;
  }

  // Coaching payment: save the subscription, make the link live, write the ledger.
  if (!(await userExists(client, ctx.coachUserId))) {
    logger.warn('Coaching payment names no known coach; ignored');
    return;
  }
  // The same payment delivered again (even under a new message id, and even
  // after the link has since ended) was already handled: its ledger row is
  // there. Nothing more to do; in particular never plan a refund or a reversal
  // for a payment that was credited legitimately the first time.
  const seenRef = event.providerEventRef ?? event.providerPaymentId;
  if (seenRef) {
    const { rowCount: already } = await client.query(
      'SELECT 1 FROM commission_ledger WHERE source_ref = $1',
      [`payment:${seenRef}`]
    );
    if (already > 0) return;
  }
  // A subscription row is only kept for a link that is still live (or one we
  // already track). When the payment cannot be used (the link cannot go live,
  // it is a duplicate, or the link is dead) the coach is NOT credited: the
  // student is refunded automatically and the ledger shows the matching
  // reversal (see below).
  let refundWhy = null;
  if (ctx.linkId && (ctx.stored || LIVE_LINK_STATUSES.includes(ctx.link.status))) {
    if (
      !LIVE_LINK_STATUSES.includes(ctx.link.status) &&
      (await hasPendingCancel(client, event.providerSubscriptionId))
    ) {
      // A renewal that lands on a coaching link that has already ended (the
      // student switched or left) while its cancel is still waiting to go
      // through: the coaching is over, so the coach is not credited and the
      // student is refunded. The cancel is kept (and tried again now).
      await planCancel(client, tasks, event.providerSubscriptionId, ctx.stored?.id ?? null, 'renewal after the coaching ended');
      refundWhy = 'the coaching had already ended';
    } else if (isExtraSubscription(ctx, event)) {
      // A second subscription for a link that already has one (a double
      // checkout): stop the extra one and give the money back.
      await planCancel(client, tasks, event.providerSubscriptionId, null, 'duplicate subscription for one link');
      refundWhy = 'a second subscription for the same coach';
    } else {
      const sub = await saveSubscription(client, event, ctx, { status: 'active' });
      if (sub.status !== 'ended') {
        const outcome = await activateCoachLink(client, ctx.link, tasks);
        if (outcome === 'blocked') {
          await planCancel(client, tasks, event.providerSubscriptionId, sub.id, 'student already has an active coach');
          refundWhy = 'the student already has another coach';
        }
      } else {
        await planCancel(client, tasks, event.providerSubscriptionId, null, 'payment on a subscription we already ended');
        refundWhy = 'the subscription had already ended';
      }
    }
  } else if (ctx.linkId) {
    // A payment for a link that is dead (ended, declined, revoked): nothing is
    // kept, so stop the subscription so it doesn't keep charging.
    await planCancel(client, tasks, event.providerSubscriptionId, null, 'payment for a coaching link that is no longer open');
    refundWhy = 'the coaching link was no longer open';
  }

  const paymentRef = event.providerEventRef ?? event.providerPaymentId;
  // Saved in the same step as the payment, so it is never lost; the actual
  // refund call happens after this step has committed. One row per payment.
  async function planRefund() {
    if (!refundWhy || !event.providerPaymentId) return;
    const { rowCount } = await client.query(
      `INSERT INTO pending_refunds (provider_payment_id, coach_id, amount_cents, currency, reason)
       VALUES ($1, $2::uuid, $3, $4, $5)
       ON CONFLICT (provider_payment_id) DO NOTHING`,
      [event.providerPaymentId, ctx.coachUserId, event.amountCents ?? null, event.currency ?? null, refundWhy]
    );
    if (rowCount > 0) tasks.push({ type: 'refund', providerPaymentId: event.providerPaymentId });
  }

  // Only US dollar amounts are ledgered (the parser already prefers a USD total
  // when Whop supplies one). Anything else is logged and skipped, never guessed.
  // UNCONFIRMED in Whop's sandbox: whether the amount field is the TOTAL the
  // student paid or net of tax/fees. Until confirmed, the commission is worked
  // out on this amount as given.
  if (event.currency && event.currency !== 'usd') {
    // Not guessed at: a HELD, zero-value row flagged for the owner so it shows
    // on the money screen instead of only being logged.
    logger.warn('Coaching payment is not in US dollars; held for the owner', { currency: event.currency });
    if (paymentRef) {
      await writeLedger(client, {
        coachId: ctx.coachUserId, studentId: ctx.userId, grossCents: 0, commissionCents: 0, coachCents: 0,
        rateBps: 0, periodStart: event.periodStart, periodEnd: event.periodEnd,
        sourceRef: `payment:${paymentRef}`, kind: 'payment', settledBy: 'cut', ownerFlag: 'non_usd_payment',
      });
    }
    await planRefund();
    return;
  }
  const gross = positiveCents(event.amountCents);
  const ref = paymentRef;
  if (!gross || !ref) {
    // Never silent: a HELD, zero-value row flagged for the owner (when there is
    // any id to key it on), plus the automatic refund where one can be made.
    // Note: a flagged payment row that has no payment id (keyed on the event id
    // instead) cannot be matched to a payment automatically; the owner has to
    // look into it by hand.
    const flagRef = ref ?? event.eventId;
    if (flagRef) {
      await writeLedger(client, {
        coachId: ctx.coachUserId, studentId: ctx.userId, grossCents: 0, commissionCents: 0, coachCents: 0,
        rateBps: 0, periodStart: event.periodStart, periodEnd: event.periodEnd,
        sourceRef: `payment:${flagRef}`, kind: 'payment', settledBy: 'cut', ownerFlag: 'non_usd_payment',
      });
    }
    await planRefund();
    logger.warn('Coaching payment had no usable amount or id; held for the owner');
    return;
  }
  const students = Math.max(await payingStudentCount(client, ctx.coachUserId), 1);
  const split = computeCommission(gross, students);
  await writeLedger(client, {
    coachId: ctx.coachUserId,
    studentId: ctx.userId,
    grossCents: split.grossCents,
    commissionCents: split.commissionCents,
    coachCents: split.coachCents,
    rateBps: split.rateBps,
    periodStart: event.periodStart,
    periodEnd: event.periodEnd,
    sourceRef: `payment:${ref}`,
    kind: 'payment',
    settledBy: settledByNow(),
  });
  if (refundWhy) {
    // The coach is not credited: the full reversal is written right next to the
    // payment (so the balance never moves), once, keyed on the payment.
    await writeLedger(client, {
      coachId: ctx.coachUserId,
      studentId: ctx.userId,
      grossCents: -split.grossCents,
      commissionCents: -split.commissionCents,
      coachCents: -split.coachCents,
      rateBps: split.rateBps,
      sourceRef: `refund:auto:${event.providerPaymentId ?? ref}`,
      kind: 'refund',
      originalRef: `payment:${ref}`,
      settledBy: settledByNow(),
      // No payment id means no automatic refund can be sent: tell the owner.
      ownerFlag: event.providerPaymentId ? undefined : 'non_usd_reversal',
    });
    await planRefund();
  }
}

// Refunds and chargebacks: a negative row that undoes (part of) the original
// payment at the original rate. Netted off the coach's balance.
async function onReversal(client, event, kind) {
  const ref = event.providerEventRef ?? event.eventId;
  // Refunds and chargebacks both carry the ORIGINAL payment's id in providerPaymentId.
  const originalPaymentId = event.refundedPaymentId ?? event.providerPaymentId;
  if (!ref || !originalPaymentId) {
    logger.warn('Refund message did not say which payment it undoes; ignored');
    return;
  }
  if (event.currency && event.currency !== 'usd') {
    // Cannot be worked out in cents: a HELD, zero-value row flagged for the
    // owner. (Skipped when it is the refund Cut itself issued for that payment.)
    logger.warn('Refund is not in US dollars; held for the owner', { currency: event.currency });
    const { rowCount: ourOwn } = await client.query(
      'SELECT 1 FROM pending_refunds WHERE provider_payment_id = $1', [originalPaymentId]
    );
    const { rows: origRows } = await client.query(
      'SELECT * FROM commission_ledger WHERE source_ref = $1', [`payment:${originalPaymentId}`]
    );
    if (ourOwn === 0 && origRows[0]) {
      await writeLedger(client, {
        coachId: origRows[0].coach_id, studentId: origRows[0].student_id, grossCents: 0, commissionCents: 0,
        coachCents: 0, rateBps: 0, sourceRef: `${kind}:${ref}`, kind, originalRef: origRows[0].source_ref,
        settledBy: origRows[0].settled_by, ownerFlag: 'non_usd_reversal',
      });
    }
    return;
  }
  if (kind === 'chargeback') {
    // A dispute already WON (its message arrived first): nothing to take back.
    const { rowCount: alreadyWon } = await client.query(
      'SELECT 1 FROM commission_ledger WHERE source_ref = $1', [`chargeback_won:${ref}`]
    );
    if (alreadyWon > 0) return;
  }
  const { rows } = await client.query(
    `SELECT * FROM commission_ledger WHERE source_ref = $1`,
    [`payment:${originalPaymentId}`]
  );
  const original = rows[0];
  if (!original) {
    // Not a coaching payment (the startup fee or the AI plan): nothing in the
    // ledger to undo. The owner decides those case by case.
    return;
  }
  const { rows: priorRows } = await client.query(
    `SELECT COALESCE(SUM(gross_cents), 0)::int AS gross, COALESCE(SUM(commission_cents), 0)::int AS commission
     FROM commission_ledger
     WHERE original_ref = $1 AND ($2::text <> 'refund' OR kind = 'refund')`,
    [original.source_ref, kind]
  );
  // A student's refund is a fact, while an open dispute is provisional (it is
  // given back if won). So a refund is measured against earlier REFUNDS only:
  // a refund that arrives while a dispute is open is still recorded, and a
  // later dispute win can then never put back money the student already got.
  const remainingGross = original.gross_cents + priorRows[0].gross;
  const remainingCommission = original.commission_cents + priorRows[0].commission;
  if (remainingGross <= 0) return;
  const asked = positiveCents(event.amountCents) ?? remainingGross;
  const reversed = reverseCommission({
    originalGrossCents: remainingGross,
    originalCommissionCents: remainingCommission,
    rateBps: original.rate_bps,
    refundCents: asked,
  });
  await writeLedger(client, {
    coachId: original.coach_id,
    studentId: original.student_id,
    grossCents: reversed.grossCents,
    commissionCents: reversed.commissionCents,
    coachCents: reversed.coachCents,
    rateBps: original.rate_bps,
    sourceRef: `${kind}:${ref}`,
    kind,
    originalRef: original.source_ref,
    settledBy: original.settled_by,
  });
}

// A dispute the coach WON: give back what the opening took, exactly once
// (keyed on the dispute id + "won"). If this message arrives before the
// dispute's opening was recorded, a zero-value marker is left so the opening
// that arrives later does nothing. A dispute that is LOST needs nothing more.
async function onDisputeWon(client, event) {
  const ref = event.providerEventRef;
  if (!ref) return;
  const { rows: takenRows } = await client.query('SELECT * FROM commission_ledger WHERE source_ref = $1', [`chargeback:${ref}`]);
  const taken = takenRows[0];
  if (taken) {
    // Give back only what still remains of the payment: never lift the
    // payment's running total above (the payment minus its REFUND rows), so a
    // student already refunded outside Cut is not paid back to the coach.
    const { rows: origRows } = await client.query('SELECT * FROM commission_ledger WHERE source_ref = $1', [taken.original_ref]);
    const original = origRows[0] ?? null;
    let restoreGross = -taken.gross_cents;
    let restoreCommission = -taken.commission_cents;
    if (original) {
      const { rows: sums } = await client.query(
        `SELECT COALESCE(SUM(gross_cents), 0)::int AS net_gross,
                COALESCE(SUM(commission_cents), 0)::int AS net_commission,
                COALESCE(SUM(gross_cents) FILTER (WHERE kind = 'refund'), 0)::int AS refund_gross,
                COALESCE(SUM(commission_cents) FILTER (WHERE kind = 'refund'), 0)::int AS refund_commission
         FROM commission_ledger WHERE original_ref = $1`,
        [taken.original_ref]
      );
      const room = (ceiling, net) => Math.max(ceiling - net, 0);
      restoreGross = Math.min(
        restoreGross,
        room(original.gross_cents + sums[0].refund_gross, original.gross_cents + sums[0].net_gross)
      );
      restoreCommission = Math.min(
        restoreCommission,
        room(original.commission_cents + sums[0].refund_commission, original.commission_cents + sums[0].net_commission),
        restoreGross
      );
    }
    await writeLedger(client, {
      coachId: taken.coach_id,
      studentId: taken.student_id,
      grossCents: restoreGross,
      commissionCents: restoreCommission,
      coachCents: restoreGross - restoreCommission,
      rateBps: taken.rate_bps,
      sourceRef: `chargeback_won:${ref}`,
      kind: 'chargeback_won',
      originalRef: taken.original_ref,
      settledBy: taken.settled_by,
    });
    return;
  }
  if (!event.providerPaymentId) return;
  const { rows: origRows } = await client.query('SELECT * FROM commission_ledger WHERE source_ref = $1', [`payment:${event.providerPaymentId}`]);
  const original = origRows[0];
  if (!original) return;
  await writeLedger(client, {
    coachId: original.coach_id, studentId: original.student_id, grossCents: 0, commissionCents: 0, coachCents: 0,
    rateBps: original.rate_bps, sourceRef: `chargeback_won:${ref}`, kind: 'chargeback_won',
    originalRef: original.source_ref, settledBy: original.settled_by,
  });
}

async function onSubscriptionStarted(client, event, tasks) {
  const ctx = await resolveContext(client, event);
  if (!ctx || !ctx.kind || !(await userExists(client, ctx.userId))) return;
  if (ctx.kind === 'coach' && (!ctx.linkId || !(ctx.stored || LIVE_LINK_STATUSES.includes(ctx.link.status)))) {
    if (ctx.kind === 'coach') {
      await planCancel(client, tasks, event.providerSubscriptionId, null, 'subscription for a coaching link that is no longer open');
    }
    return;
  }
  if (ctx.kind === 'coach' && isExtraSubscription(ctx, event)) {
    await planCancel(client, tasks, event.providerSubscriptionId, null, 'duplicate subscription for one link');
    return;
  }
  const sub = await saveSubscription(client, event, ctx, { status: 'active' });
  if (sub.status === 'ended') return;
  if (ctx.kind === 'ai_plan') {
    await activateAiPlan(client, ctx.userId, event.providerCustomerId);
  } else if ((await activateCoachLink(client, ctx.link, tasks)) === 'blocked') {
    await planCancel(client, tasks, event.providerSubscriptionId, sub.id, 'student already has an active coach');
  }
}

async function onSubscriptionEnded(client, event) {
  const ctx = await resolveContext(client, event);
  const sub = ctx?.stored;
  if (!sub) return;
  // Only the subscription this message is really about may end the stored one
  // (and with it the coach link). The "live subscription on this link"
  // fallback in findStoredSubscription must not let a deliberately cancelled
  // EXTRA subscription end the legitimate one.
  if (sub.provider_subscription_id && sub.provider_subscription_id !== event.providerSubscriptionId) {
    logger.warn('A subscription-ended message is for a different subscription than the one on file; ignored');
    return;
  }
  await client.query(
    `UPDATE student_subscriptions SET status = 'ended', updated_at = now() WHERE id = $1`,
    [sub.id]
  );
  if (sub.kind === 'ai_plan') {
    // Back to free only when nothing else still grants the AI plan: another
    // live AI subscription of theirs. (Owner-granted premium has no separate
    // marker in the database today - it is just plan_tier - so it cannot be
    // told apart here; if the owner starts granting premium by hand, add a
    // "granted" flag and check it in this statement.)
    await client.query(
      `UPDATE users SET plan_tier = 'free'
       WHERE id = $1
         AND NOT EXISTS (
           SELECT 1 FROM student_subscriptions
           WHERE user_id = $1 AND kind = 'ai_plan' AND status <> 'ended' AND id <> $2
         )`,
      [sub.user_id, sub.id]
    );
  } else if (sub.coach_client_id) {
    await client.query(
      `UPDATE coach_clients SET status = 'ended', ended_at = now()
       WHERE id = $1 AND status IN ('active', 'pending_payment')`,
      [sub.coach_client_id]
    );
  }
}

async function onIdentityVerified(client, event) {
  const accountId = event.providerAccountId;
  const coachId = cleanUuid(event.metadata?.coachUserId);
  if (accountId) {
    const { rowCount } = await client.query(
      `UPDATE coach_subscriptions SET identity_verified = true, updated_at = now()
       WHERE provider_account_id = $1`,
      [accountId]
    );
    if (rowCount > 0) return;
  }
  if (coachId && (await userExists(client, coachId))) {
    await client.query(
      `INSERT INTO coach_subscriptions (coach_id, provider_account_id, identity_verified)
       VALUES ($1::uuid, $2, true)
       ON CONFLICT (coach_id) DO UPDATE
       SET identity_verified = true,
           provider_account_id = COALESCE(coach_subscriptions.provider_account_id, $2),
           updated_at = now()`,
      [coachId, accountId ?? null]
    );
  }
}

// Applies one verified message. Returns 'duplicate' when it was seen before,
// 'handled' otherwise (including messages we choose to ignore).
export async function applyBillingEvent(event) {
  const tasks = [];
  const outcome = await withTransaction(async (client) => {
    if (event.eventId) {
      const { rowCount } = await client.query(
        `INSERT INTO billing_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING`,
        [event.eventId, event.type]
      );
      if (rowCount === 0) return 'duplicate';
    }

    switch (event.type) {
      case 'payment.succeeded':
        await onPaymentSucceeded(client, event, tasks);
        break;
      case 'payment.failed':
        // A failed renewal keeps access while the provider retries.
        if (event.providerSubscriptionId) {
          await client.query(
            `UPDATE student_subscriptions SET status = 'past_due', updated_at = now()
             WHERE provider_subscription_id = $1 AND status = 'active'`,
            [event.providerSubscriptionId]
          );
        }
        break;
      case 'payment.refunded':
        await onReversal(client, event, 'refund');
        break;
      case 'payment.disputed':
        await onReversal(client, event, 'chargeback');
        break;
      case 'payment.dispute_won':
        await onDisputeWon(client, event);
        break;
      case 'subscription.started':
        await onSubscriptionStarted(client, event, tasks);
        break;
      case 'subscription.cancel_scheduled':
        if (event.providerSubscriptionId) {
          await client.query(
            `UPDATE student_subscriptions
             SET cancel_at_period_end = true,
                 current_period_end = COALESCE($2::timestamptz, current_period_end),
                 updated_at = now()
             WHERE provider_subscription_id = $1 AND status <> 'ended'`,
            [event.providerSubscriptionId, event.periodEnd ?? null]
          );
        }
        break;
      case 'subscription.ended':
        await onSubscriptionEnded(client, event);
        break;
      case 'coach.identity_verified':
        await onIdentityVerified(client, event);
        break;
      default:
        break; // 'ignored' and anything unknown: accepted quietly.
    }
    return 'handled';
  });
  // Only now that everything is saved: stop subscriptions that can't go live,
  // end a switched-from coach's renewal, and send automatic refunds.
  await runProviderTasks(tasks);
  return outcome;
}
