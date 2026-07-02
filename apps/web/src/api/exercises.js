import { request } from './client.js';

export function getExercises({ search } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  const qs = params.toString();
  return request(`/exercises${qs ? `?${qs}` : ''}`);
}
