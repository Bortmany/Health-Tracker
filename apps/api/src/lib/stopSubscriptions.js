import { pool } from '../db/pool.js';
import { getBillingClient, isBillingEnabled } from './billing/index.js';
import { logger } from './logger.js';

// When a coaching link ends or a coach is revoked, the students' paid
// subscriptions to that coach must stop renewing, or people would keep paying
// for coaching that no longer exists. For each live subscription on those
// links this asks the payment company to cancel at the end of the paid period
// and marks it "cancels at period end". It never throws: the link has already
// been ended, and a payment company hiccup must not undo that. A failure is
// logged (ids only) so the owner can cancel by hand.
//
// `where` is a SQL fragment on coach_clients (alias cc) and `params` its values.
export async function stopSubscriptionsWhere(where, params) {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.provider_subscription_id
       FROM student_subscriptions s
       JOIN coach_clients cc ON cc.id = s.coach_client_id
       WHERE s.kind = 'coach' AND s.status <> 'ended' AND s.cancel_at_period_end = false AND (${where})`,
      params
    );
    if (rows.length === 0) return;
    const client = isBillingEnabled() ? getBillingClient() : null;
    for (const sub of rows) {
      let periodEnd = null;
      if (client && sub.provider_subscription_id) {
        try {
          const result = await client.cancelSubscription({ providerSubscriptionId: sub.provider_subscription_id });
          periodEnd = result?.periodEnd ?? null;
        } catch (err) {
          logger.error('Could not stop a coaching subscription at the payment company', {
            subscriptionId: sub.id,
            error: err,
          });
        }
      }
      await pool.query(
        `UPDATE student_subscriptions
         SET cancel_at_period_end = true,
             current_period_end = COALESCE($2::timestamptz, current_period_end),
             updated_at = now()
         WHERE id = $1`,
        [sub.id, periodEnd]
      );
    }
  } catch (err) {
    logger.error('Could not stop coaching subscriptions', { error: err });
  }
}
