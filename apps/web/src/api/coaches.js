import { request } from './client.js';

// Public coach directory — no login needed. The server only ever returns
// profiles the coach has switched to public, and never an email address.
export function getCoaches(specialty) {
  const query = specialty ? `?specialty=${encodeURIComponent(specialty)}` : '';
  return request(`/coaches${query}`);
}

// One public profile; 404 when the slug is unknown or the profile is private.
export function getCoach(slug) {
  return request(`/coaches/${encodeURIComponent(slug)}`);
}

// Who a referral code belongs to — just { slug, displayName }, for the
// "Invited by Coach …" banner on sign-up. 404 when the code isn't valid.
export function getCoachByReferral(code) {
  return request(`/coaches/referral/${encodeURIComponent(code)}`);
}
