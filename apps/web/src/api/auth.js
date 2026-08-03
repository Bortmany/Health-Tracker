import { request } from './client.js';

export function register({ email, password, displayName }) {
  // Note: accounts are always created as regular ('consumer') accounts. Coach
  // access is granted through a separate verified path, never at sign-up.
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
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
