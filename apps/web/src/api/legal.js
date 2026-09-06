import { request } from './client.js';

// Public — no login needed. Returns { contact: { email } }.
export function getContact() {
  return request('/legal/contact');
}
