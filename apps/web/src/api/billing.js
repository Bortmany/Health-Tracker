import { request } from './client.js';

export function getBillingStatus() {
  return request('/billing/status');
}

export function createCheckout() {
  return request('/billing/checkout', { method: 'POST' });
}
