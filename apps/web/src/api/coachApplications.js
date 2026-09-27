import { request } from './client.js';

// The signed-in user's own coach application (the server never returns
// anyone else's).
export function getMyApplication() {
  return request('/coach-applications/mine');
}

export function createApplication(application) {
  return request('/coach-applications', { method: 'POST', body: JSON.stringify(application) });
}

export function withdrawApplication(id) {
  return request(`/coach-applications/${id}`, { method: 'DELETE' });
}
