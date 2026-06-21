import { request } from './client.js';

export function getNutritionRange({ from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return request(`/nutrition${qs ? `?${qs}` : ''}`);
}

export function getNutrition(date) {
  return request(`/nutrition/${date}`);
}

export function putNutrition(date, payload) {
  return request(`/nutrition/${date}`, { method: 'PUT', body: JSON.stringify(payload) });
}
