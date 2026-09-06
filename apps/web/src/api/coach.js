import { request } from './client.js';

export function getClients() {
  return request('/coach/clients');
}

export function createInvite() {
  return request('/coach/invites', { method: 'POST' });
}

export function removeClient(linkId) {
  return request(`/coach/clients/${linkId}`, { method: 'DELETE' });
}

export function getClientSummary(clientId) {
  return request(`/coach/clients/${clientId}/summary`);
}

export function assignProgram(clientId, program) {
  return request(`/coach/clients/${clientId}/programs`, {
    method: 'POST',
    body: JSON.stringify(program),
  });
}

export function getMyCoach() {
  return request('/coach-link');
}

export function redeemCoachCode(code) {
  return request('/coach-link/redeem', { method: 'POST', body: JSON.stringify({ code }) });
}

export function removeMyCoach() {
  return request('/coach-link', { method: 'DELETE' });
}

// ---- The coach's own public profile ----

export function getProfile() {
  return request('/coach/profile');
}

export function updateProfile(changes) {
  return request('/coach/profile', { method: 'PUT', body: JSON.stringify(changes) });
}

// ---- Students asking to train with this coach ----

export function getRequests() {
  return request('/coach/requests');
}

export function acceptRequest(id) {
  return request(`/coach/requests/${id}/accept`, { method: 'POST' });
}

export function declineRequest(id) {
  return request(`/coach/requests/${id}/decline`, { method: 'POST' });
}

// Always answers 202 with the same neutral message, whether or not the
// address has a Cut account — the coach can never tell the difference.
export function inviteByEmail(email) {
  return request('/coach/invites/email', { method: 'POST', body: JSON.stringify({ email }) });
}

// ---- Student side: requests and coach invites ----

export function requestCoach(coachSlug) {
  return request('/coach-link/requests', { method: 'POST', body: JSON.stringify({ coachSlug }) });
}

export function cancelCoachRequest(id) {
  return request(`/coach-link/requests/${id}`, { method: 'DELETE' });
}

export function acceptCoachInvite(id, { replaceCurrent = false } = {}) {
  return request(`/coach-link/invites/${id}/accept`, {
    method: 'POST',
    body: JSON.stringify({ replaceCurrent }),
  });
}

export function declineCoachInvite(id) {
  return request(`/coach-link/invites/${id}/decline`, { method: 'POST' });
}
