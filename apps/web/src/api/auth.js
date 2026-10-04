import { request } from './client.js';

export function register({ email, password, displayName, inviteCode, referralCode }) {
  // Note: accounts are always created as regular ('consumer') accounts. Coach
  // access is granted through a separate verified path, never at sign-up.
  // `inviteCode` is the signup invite (only needed when sign-up is
  // invitation-only) — not a coach invite code. `referralCode` comes from a
  // coach's share link and stands in for the invite code when present.
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(
      referralCode ? { email, password, displayName, referralCode } : { email, password, displayName, inviteCode }
    ),
  });
}

// Public: { mode: "open" | "invite" | "closed" } — whether sign-up is open to
// everyone, needs a signup invite code, or is switched off.
export function signupMode() {
  return request('/auth/signup-mode');
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

// Always answers { ok: true } for any well-formed email (registered or not),
// so nobody can use it to find out who has an account. 429 when tried too often.
export function forgotPassword(email) {
  return request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}

// Error code LINK_INVALID when the link is expired, used or wrong.
export function resetPassword({ token, password }) {
  return request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
}
