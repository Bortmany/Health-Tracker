import { request } from './client.js';

// Owner-only routes. Anyone who isn't the admin gets a plain 404 from every
// one of these, so the screens must never call them before the admin check.
export function getCoachApplications(status = 'pending') {
  return request(`/admin/coach-applications?status=${encodeURIComponent(status)}`);
}

export function approveApplication(id) {
  return request(`/admin/coach-applications/${id}/approve`, { method: 'POST' });
}

export function declineApplication(id, reason) {
  return request(`/admin/coach-applications/${id}/decline`, {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export function getCoaches() {
  return request('/admin/coaches');
}

export function revokeCoach(userId) {
  return request(`/admin/coaches/${userId}/revoke`, { method: 'POST' });
}

// ---- Money (owner only) ----

export function getCoachEarnings() {
  return request('/admin/coaches/earnings');
}

// Pays every coach who is owed money and has finished the identity check.
// -> { started, totalCents, failed }
export function runPayouts() {
  return request('/admin/payouts/run', { method: 'POST' });
}

// Settles a payout parked for a check: outcome is 'paid' or 'failed'.
export function resolvePayout(id, outcome, note) {
  return request(`/admin/payouts/${id}/resolve`, { method: 'POST', body: JSON.stringify({ outcome, note }) });
}

export function getPayouts({ limit = 20, offset = 0 } = {}) {
  return request(`/admin/payouts?limit=${limit}&offset=${offset}`);
}
