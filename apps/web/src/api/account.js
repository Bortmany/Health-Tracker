import { request } from './client.js';

// One JSON document holding everything the signed-in user has stored.
// `today` (this device's day) is what the export's streak counts from.
export function exportData(today) {
  return request(`/export${today ? `?today=${today}` : ''}`);
}

// Permanently deletes the account; the current password is required.
export function deleteAccount({ password }) {
  return request('/account', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
}
