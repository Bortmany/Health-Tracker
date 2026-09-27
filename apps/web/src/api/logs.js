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

// `today` is this device's own day, so the streak counts from the right day
// in Oman (the server's clock runs on UTC).
export function getStreak(today) {
  return request(`/logs/streak${today ? `?today=${today}` : ''}`);
}
