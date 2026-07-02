import { request } from './client.js';

export function register({ email, password, displayName, role }) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName, role }),
  });
}

export function login({ email, password }) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return request('/auth/logout', { method: 'POST' });
}

export function me() {
  return request('/auth/me');
}
