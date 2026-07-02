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
