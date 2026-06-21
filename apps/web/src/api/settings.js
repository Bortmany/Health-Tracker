import { request } from './client.js';

export function getSettings() {
  return request('/settings');
}

export function updateSettings(settings) {
  return request('/settings', { method: 'PUT', body: JSON.stringify(settings) });
}
