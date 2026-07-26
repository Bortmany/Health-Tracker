import { request } from './client.js';

export function getMuscleHeatmap({ days } = {}) {
  const params = new URLSearchParams();
  if (days) params.set('days', days);
  const qs = params.toString();
  return request(`/muscle-heatmap${qs ? `?${qs}` : ''}`);
}
