import { request } from './client.js';

// One JSON document holding everything the signed-in user has stored.
export function exportData() {
  return request('/export');
}

// Permanently deletes the account; the current password is required.
export function deleteAccount({ password }) {
  return request('/account', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
}
