import { request } from './client.js';

// The signed-in coach's own money. The server scopes every one of these to
// the caller, so nothing here ever carries a user id.
export function getCoachBilling() {
  return request('/coach/billing');
}

export function setCoachPrice(priceCents) {
  return request('/coach/billing/price', { method: 'PUT', body: JSON.stringify({ priceCents }) });
}

// -> { checkoutUrl }
export function startStartupFee() {
  return request('/coach/billing/startup-fee', { method: 'POST' });
}

// -> { url }
export function startOnboarding() {
  return request('/coach/billing/onboarding', { method: 'POST' });
}

export function getEarnings() {
  return request('/coach/earnings');
}

// -> { payouts: [...], hasMore }
export function getPayouts({ limit = 10, offset = 0 } = {}) {
  return request(`/coach/payouts?limit=${limit}&offset=${offset}`);
}
