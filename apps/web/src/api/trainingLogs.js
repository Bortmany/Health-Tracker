import { request } from './client.js';

export function getTrainingLogs({ from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return request(`/training-logs${qs ? `?${qs}` : ''}`);
}

export function getTrainingLog(id) {
  return request(`/training-logs/${id}`);
}

export function createTrainingLog(payload) {
  return request('/training-logs', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateTrainingLog(id, payload) {
  return request(`/training-logs/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteTrainingLog(id) {
  return request(`/training-logs/${id}`, { method: 'DELETE' });
}

export function getExerciseHistory(name, { before } = {}) {
  const params = new URLSearchParams({ name });
  if (before) params.set('before', before);
  return request(`/training-logs/exercise-history?${params.toString()}`);
}
