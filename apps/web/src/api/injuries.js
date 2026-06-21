import { request } from './client.js';

export function getInjuries() {
  return request('/injuries');
}

export function createInjury(injury) {
  return request('/injuries', { method: 'POST', body: JSON.stringify(injury) });
}

export function updateInjury(id, injury) {
  return request(`/injuries/${id}`, { method: 'PATCH', body: JSON.stringify(injury) });
}
