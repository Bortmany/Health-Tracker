import { pool } from '../db/pool.js';
import { cancelSubscriptionSafely } from './providerRetries.js';
import { logger } from './logger.js';

// When a coaching link ends or a coach is revoked, the students' paid
// subscriptions to that coach must stop renewing, or people would keep paying
// for coaching that no longer exists. For each live subscription on those
// links this asks the payment company to cancel at the end of the paid period
// and marks it "cancels at period end" ONLY once the payment company has
// confirmed. It never throws: the link has already been ended, and a payment
// company hiccup must not undo that. A cancel that fails is SAVED
// (providerRetries.js) and retried later; it is not marked as cancelled.
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
    for (const sub of rows) {
      await cancelSubscriptionSafely({
        providerSubscriptionId: sub.provider_subscription_id,
        subscriptionId: sub.id,
        reason: 'coaching link ended',
      });
    }
  } catch (err) {
    logger.error('Could not stop coaching subscriptions', { error: err });
  }
}
