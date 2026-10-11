import { pool } from '../db/pool.js';
import { getBillingClient, isBillingEnabled } from './billing/index.js';
import { logger } from './logger.js';

// Two kinds of "tell the payment company to do something" that must never be
// forgotten if the first try fails:
//
//  * Stopping a student's subscription from renewing (a cancel).
//  * Giving a student their money back for a payment that cannot be used.
//
// Each failure is SAVED (tables pending_cancels / pending_refunds from
// migration 028) so it survives a restart. There is no background timer, so
// the saved ones are tried again whenever the owner presses "Pay coaches now"
// and, for cancels, when the student next opens their subscriptions. The owner
// sees what is still waiting on the /admin/coaches money screen.

function billingClientOrNull() {
  if (!isBillingEnabled()) return null;
  try {
    return getBillingClient();
  } catch (err) {
    logger.error('Could not reach the payment company', { error: err });
    return null;
  }
}

async function markSubscriptionCancelled(subscriptionId, periodEnd) {
  if (!subscriptionId) return;
  await pool.query(
    `UPDATE student_subscriptions
     SET cancel_at_period_end = true,
         current_period_end = COALESCE($2::timestamptz, current_period_end),
         updated_at = now()
     WHERE id = $1`,
    [subscriptionId, periodEnd ?? null]
  );
}

async function rememberPendingCancel(providerSubscriptionId, subscriptionId, reason) {
  await pool.query(
    `INSERT INTO pending_cancels (provider_subscription_id, subscription_id, reason)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider_subscription_id) DO UPDATE
     SET attempts = pending_cancels.attempts + 1,
         subscription_id = COALESCE(pending_cancels.subscription_id, EXCLUDED.subscription_id),
         updated_at = now()`,
    [providerSubscriptionId, subscriptionId ?? null, reason ?? null]
  );
}

// Stops one subscription at the payment company, at the end of the period
// already paid for. Never throws. Returns true only when the payment company
// really confirmed it; otherwise the cancel is saved for a later retry and
// false is returned (the subscription is NOT marked as cancelled).
export async function cancelSubscriptionSafely({ providerSubscriptionId, subscriptionId = null, reason = null }) {
  if (!providerSubscriptionId) {
    // Nothing exists at the payment company (a free link): just mark ours.
    try {
      await markSubscriptionCancelled(subscriptionId, null);
    } catch (err) {
      logger.error('Could not mark a subscription as cancelling', { error: err });
    }
    return true;
  }
  try {
    const client = billingClientOrNull();
    if (!client) throw new Error('payments are not switched on');
    const result = await client.cancelSubscription({ providerSubscriptionId });
    // `alreadyGone`: the payment company no longer has it (already cancelled
    // or not found). That is the outcome we wanted, so it counts as success.
    await markSubscriptionCancelled(subscriptionId, result?.alreadyGone ? null : result?.periodEnd);
    await pool.query('DELETE FROM pending_cancels WHERE provider_subscription_id = $1', [providerSubscriptionId]);
    return true;
  } catch (err) {
    logger.error(
      'OWNER ACTION NEEDED: a coaching subscription is NOT yet stopped at the payment company, so the student may still be charged. It is saved and will be retried; cancel it by hand if it keeps failing.',
      { subscriptionId, reason, error: err }
    );
    try {
      await rememberPendingCancel(providerSubscriptionId, subscriptionId, reason);
    } catch (saveErr) {
      logger.error('OWNER ACTION NEEDED: could not even save a failed cancel for retry', { subscriptionId, error: saveErr });
    }
    return false;
  }
}

// Tries every saved cancel again (or just one student's, when `userId` is
// given: scoped to that student's own subscriptions).
export async function retryPendingCancels({ userId = null } = {}) {
  try {
    const { rows } = await pool.query(
      `SELECT pc.provider_subscription_id, pc.subscription_id, pc.reason
       FROM pending_cancels pc
       LEFT JOIN student_subscriptions s ON s.id = pc.subscription_id
       WHERE ($1::uuid IS NULL OR s.user_id = $1::uuid)
       ORDER BY pc.updated_at, pc.created_at
       LIMIT 50`,
      [userId]
    );
    for (const row of rows) {
      await cancelSubscriptionSafely({
        providerSubscriptionId: row.provider_subscription_id,
        subscriptionId: row.subscription_id,
        reason: row.reason,
      });
    }
  } catch (err) {
    logger.error('Could not retry the saved subscription cancels', { error: err });
  }
}

// Gives a payment back in full. Never throws. The refund was already saved
// (pending_refunds, written in the same step as the payment); this marks it
// done only when the payment company confirms, otherwise it stays pending.
export async function refundPaymentSafely({ providerPaymentId }) {
  try {
    const client = billingClientOrNull();
    if (!client) throw new Error('payments are not switched on');
    await client.refundPayment({ providerPaymentId, idempotencyKey: `auto-refund-${providerPaymentId}` });
    await pool.query(
      `UPDATE pending_refunds SET status = 'done', attempts = attempts + 1, updated_at = now()
       WHERE provider_payment_id = $1`,
      [providerPaymentId]
    );
    return true;
  } catch (err) {
    logger.error(
      'OWNER ACTION NEEDED: an automatic refund to a student did NOT go through. It is saved and will be retried; refund it by hand if it keeps failing.',
      { providerPaymentId, error: err }
    );
    try {
      await pool.query(
        `UPDATE pending_refunds SET attempts = attempts + 1, updated_at = now() WHERE provider_payment_id = $1`,
        [providerPaymentId]
      );
    } catch (saveErr) {
      logger.error('Could not record a failed refund attempt', { error: saveErr });
    }
    return false;
  }
}

export async function retryPendingRefunds() {
  try {
    const { rows } = await pool.query(
      `SELECT provider_payment_id FROM pending_refunds WHERE status = 'pending' ORDER BY updated_at, created_at LIMIT 50`
    );
    for (const row of rows) await refundPaymentSafely({ providerPaymentId: row.provider_payment_id });
  } catch (err) {
    logger.error('Could not retry the saved refunds', { error: err });
  }
}
