// Shared checks for the forms that collect personal details.
//
// These run while the user is still on the form so nobody submits something
// impossible and waits for a round trip to find out. The server checks the
// same things again (apps/api/src/lib/validate.js) — the browser copy is for
// speed and friendliness, never the only line of defence. Keep the two in
// step if either changes.

// Something before the @, a domain, and a real dot-ending. Not a list of
// allowed providers — any work domain has to keep working.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

export const EMAIL_ERROR = 'That email doesn’t look right — try something like JohnDoe@gmail.com';

export function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

// Returns a plain-English message to show under the field, or '' when the
// address is fine. An empty box says nothing — the browser's own "required"
// prompt covers that case.
export function emailError(value) {
  if (!value || !value.trim()) return '';
  return isValidEmail(value) ? '' : EMAIL_ERROR;
}
