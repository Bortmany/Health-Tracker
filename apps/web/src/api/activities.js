import { request } from './client.js';

export function getActivities() {
  return request('/activities');
}

export function createActivity(activity) {
  return request('/activities', { method: 'POST', body: JSON.stringify(activity) });
}

export function updateActivity(id, activity) {
  return request(`/activities/${id}`, { method: 'PUT', body: JSON.stringify(activity) });
}

export function deleteActivity(id) {
  return request(`/activities/${id}`, { method: 'DELETE' });
}
