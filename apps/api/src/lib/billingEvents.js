import { pool } from '../db/pool.js';
import { getBillingClient, isBillingEnabled, payoutMethod } from './billing/index.js';
import { computeCommission, reverseCommission } from './commission.js';
import { payingStudentCount } from './coachMoney.js';
import { logger } from './logger.js';
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
        'SELECT id, coach_id, client_id, status FROM coach_clients WHERE id = $1::uuid',
        [linkId]
      );
      link = rows[0] ?? null;
    }
    if (!link && userId && coachUserId) {
      const { rows } = await client.query(
        `SELECT id, coach_id, client_id, status FROM coach_clients
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
async function activateCoachLink(client, link) {
  if (!link || link.status !== 'pending_payment') return 'ok';
  await client.query('SAVEPOINT activate_link');
  try {
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
    // while paying). The money is recorded; the owner can refund by hand.
    if (err.code !== '23505') throw err;
    await client.query('ROLLBACK TO SAVEPOINT activate_link');
    logger.warn('A paid coaching link could not go live: the student already has an active coach');
    await client.query('RELEASE SAVEPOINT activate_link');
    return 'blocked';
  }
  await client.query('RELEASE SAVEPOINT activate_link');
  return 'ok';
}

// Subscriptions to stop at the payment company. They are collected during the
// message and only acted on AFTER the database work has committed (no network
// call while a transaction is open). `rowId` is our stored subscription row,
// if there is one, so it can be marked "cancels at period end" once stopped.
function queueProviderCancel(tasks, providerSubscriptionId, rowId, why) {
  if (!providerSubscriptionId) return;
  tasks.push({ providerSubscriptionId, rowId: rowId ?? null, why });
}

async function runProviderCancels(tasks) {
  if (tasks.length === 0 || !isBillingEnabled()) return;
  let billing;
  try {
    billing = getBillingClient();
  } catch (err) {
    logger.error('Could not reach the payment company to stop a subscription', { error: err });
    return;
  }
  for (const task of tasks) {
    try {
      const result = await billing.cancelSubscription({ providerSubscriptionId: task.providerSubscriptionId });
      logger.warn('Stopped a subscription that could not go live', { why: task.why, subscriptionRow: task.rowId });
      if (task.rowId) {
        await pool.query(
          `UPDATE student_subscriptions
           SET cancel_at_period_end = true,
               current_period_end = COALESCE($2::timestamptz, current_period_end),
               updated_at = now()
           WHERE id = $1 AND provider_subscription_id = $3`,
          [task.rowId, result?.periodEnd ?? null, task.providerSubscriptionId]
        );
      }
    } catch (err) {
      logger.error(
        'OWNER ACTION NEEDED: a student is paying for coaching that cannot go live and Cut could not stop it at the payment company. Cancel it by hand or refund.',
        { why: task.why, subscriptionRow: task.rowId, error: err }
      );
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
        period_start, period_end, source_ref, kind, original_ref, settled_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9, $10, $11, $12)
     ON CONFLICT (source_ref) DO NOTHING`,
    [
      row.coachId, row.studentId, row.grossCents, row.commissionCents, row.coachCents, row.rateBps,
      row.periodStart ?? null, row.periodEnd ?? null, row.sourceRef, row.kind, row.originalRef ?? null, row.settledBy,
    ]
  );
}

// True when this message is about a provider subscription different from the
// one already stored for the same coaching link.
function isExtraSubscription(ctx, event) {
  const known = ctx.stored?.provider_subscription_id;
  return Boolean(known && event.providerSubscriptionId && known !== event.providerSubscriptionId);
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
  // A subscription row is only kept for a link that is still live (or one we
  // already track); a late payment on a dead link is still LEDGERED below.
  if (ctx.linkId && (ctx.stored || LIVE_LINK_STATUSES.includes(ctx.link.status))) {
    if (isExtraSubscription(ctx, event)) {
      // A second subscription for a link that already has one (a double
      // checkout): stop the extra one; the money it took is still ledgered.
      queueProviderCancel(tasks, event.providerSubscriptionId, null, 'duplicate subscription for one link');
    } else {
      const sub = await saveSubscription(client, event, ctx, { status: 'active' });
      if (sub.status !== 'ended') {
        const outcome = await activateCoachLink(client, ctx.link);
        if (outcome === 'blocked') {
          queueProviderCancel(tasks, event.providerSubscriptionId, sub.id, 'student already has an active coach');
        }
      } else {
        queueProviderCancel(tasks, event.providerSubscriptionId, null, 'payment on a subscription we already ended');
      }
    }
  } else if (ctx.linkId) {
    // A payment for a link that is dead (ended, declined, revoked): nothing is
    // kept, so stop the subscription so it doesn't keep charging.
    queueProviderCancel(tasks, event.providerSubscriptionId, null, 'payment for a coaching link that is no longer open');
  }

  // Only US dollar amounts are ledgered (the parser already prefers a USD total
  // when Whop supplies one). Anything else is logged and skipped, never guessed.
  // UNCONFIRMED in Whop's sandbox: whether the amount field is the TOTAL the
  // student paid or net of tax/fees. Until confirmed, the commission is worked
  // out on this amount as given.
  if (event.currency && event.currency !== 'usd') {
    logger.warn('Coaching payment is not in US dollars; no ledger row written', { currency: event.currency });
    return;
  }
  const gross = positiveCents(event.amountCents);
  const ref = event.providerEventRef ?? event.providerPaymentId;
  if (!gross || !ref) {
    logger.warn('Coaching payment had no usable amount or id; no ledger row written');
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
}

// Refunds and chargebacks: a negative row that undoes (part of) the original
// payment at the original rate. Netted off the coach's balance.
async function onReversal(client, event, kind) {
  const ref = event.providerEventRef ?? event.eventId;
  if (event.currency && event.currency !== 'usd') {
    logger.warn('Refund is not in US dollars; no ledger row written', { currency: event.currency });
    return;
  }
  // Refunds and chargebacks both carry the ORIGINAL payment's id in providerPaymentId.
  const originalPaymentId = event.refundedPaymentId ?? event.providerPaymentId;
  if (!ref || !originalPaymentId) {
    logger.warn('Refund message did not say which payment it undoes; ignored');
    return;
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
     FROM commission_ledger WHERE original_ref = $1`,
    [original.source_ref]
  );
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

async function onSubscriptionStarted(client, event, tasks) {
  const ctx = await resolveContext(client, event);
  if (!ctx || !ctx.kind || !(await userExists(client, ctx.userId))) return;
  if (ctx.kind === 'coach' && (!ctx.linkId || !(ctx.stored || LIVE_LINK_STATUSES.includes(ctx.link.status)))) {
    if (ctx.kind === 'coach') {
      queueProviderCancel(tasks, event.providerSubscriptionId, null, 'subscription for a coaching link that is no longer open');
    }
    return;
  }
  if (ctx.kind === 'coach' && isExtraSubscription(ctx, event)) {
    queueProviderCancel(tasks, event.providerSubscriptionId, null, 'duplicate subscription for one link');
    return;
  }
  const sub = await saveSubscription(client, event, ctx, { status: 'active' });
  if (sub.status === 'ended') return;
  if (ctx.kind === 'ai_plan') {
    await activateAiPlan(client, ctx.userId, event.providerCustomerId);
  } else if ((await activateCoachLink(client, ctx.link)) === 'blocked') {
    queueProviderCancel(tasks, event.providerSubscriptionId, sub.id, 'student already has an active coach');
  }
}

async function onSubscriptionEnded(client, event) {
  const ctx = await resolveContext(client, event);
  const sub = ctx?.stored;
  if (!sub) return;
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
  // Only now that everything is saved: stop any subscription that can't go live.
  await runProviderCancels(tasks);
  return outcome;
}
