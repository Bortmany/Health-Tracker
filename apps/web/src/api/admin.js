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
