import { request } from './client.js';

export function getTemplates(filters = {}) {
  const params = new URLSearchParams();
  for (const key of ['goal', 'experience', 'equipment']) {
    if (filters[key]) params.set(key, filters[key]);
  }
  const qs = params.toString();
  return request(`/plans/templates${qs ? `?${qs}` : ''}`);
}

export function getRecommendedTemplates() {
  return request('/plans/templates/recommended');
}

export function getTemplate(id) {
  return request(`/plans/templates/${id}`);
}

export function adoptTemplate(id, payload = {}) {
  return request(`/plans/templates/${id}/adopt`, { method: 'POST', body: JSON.stringify(payload) });
}

export function getMyPlan() {
  return request('/plans/my-plan');
}

export function deleteMyPlan() {
  return request('/plans/my-plan', { method: 'DELETE' });
}
