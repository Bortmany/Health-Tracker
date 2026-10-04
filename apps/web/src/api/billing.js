import { request } from './client.js';

// { configured, payouts: { configured, method }, email: { configured }, planTier, aiPlanEnabled }
export function getBillingStatus() {
  return request('/billing/status');
}

// ---- Student: pay a coach, manage subscriptions, buy the AI plan ----

// -> { checkoutUrl }
export function createCoachCheckout(coachId) {
  return request('/billing/coach-checkout', { method: 'POST', body: JSON.stringify({ coachId }) });
}

// The signed-in person's own subscriptions (a bare array).
export function getSubscriptions() {
  return request('/billing/subscriptions');
}

export function cancelSubscription(id) {
  return request(`/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

// interval: 'month' | 'year' -> { checkoutUrl }
export function createAiCheckout(interval) {
  return request('/billing/ai-checkout', { method: 'POST', body: JSON.stringify({ interval }) });
}
