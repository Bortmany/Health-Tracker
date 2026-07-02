import { request } from './client.js';

export function getLogs({ from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return request(`/logs${qs ? `?${qs}` : ''}`);
}

export function getHabitSummary({ from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return request(`/logs/habit-summary${qs ? `?${qs}` : ''}`);
}

export function getLog(date) {
  return request(`/logs/${date}`);
}

export function putLog(date, payload) {
  return request(`/logs/${date}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function getStreak() {
  return request('/logs/streak');
}
