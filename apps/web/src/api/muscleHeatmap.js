import { request } from './client.js';

// `today` is this device's own day, so the map fades from the right day in
// Oman (the server's clock runs on UTC).
export function getMuscleHeatmap({ days, today } = {}) {
  const params = new URLSearchParams();
  if (days) params.set('days', days);
  if (today) params.set('today', today);
  const qs = params.toString();
  return request(`/muscle-heatmap${qs ? `?${qs}` : ''}`);
}
