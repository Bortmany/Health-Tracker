import { timingSafeEqual } from 'node:crypto';

// Signup invites — who is allowed to create an account at all.
//
// NOT the same thing as coach invite codes (routes/coachLink.js), which link an
// existing client to a coach. This module gates account creation itself, so
// the app can run invitation-only until the paywall is live.
//
// Two env vars drive it:
//   SIGNUP_INVITE_CODES  comma-separated list, each code 8+ characters
//   SIGNUPS_OPEN         "true" lets anyone sign up, no code needed
//
// Rule (production):   OPEN if SIGNUPS_OPEN=true; else INVITE if any codes are
//                      set; else CLOSED. Safe by default — nobody gets in until
//                      the owner sets something.
// Rule (dev / test):   OPEN unless codes are set (so the test suite and local
//                      work keep running without any setup); INVITE when codes
//                      are set so the invite screen can be tried locally.

const MIN_CODE_LENGTH = 8;

// Parse the comma-separated list. Blank entries are ignored; anything shorter
// than 8 characters is dropped (a short code would be too easy to guess).
export function parseInviteCodes(raw) {
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code.length >= MIN_CODE_LENGTH);
}

export function getSignupMode(env = process.env) {
  const codes = parseInviteCodes(env.SIGNUP_INVITE_CODES);
  const open = (env.SIGNUPS_OPEN ?? '').trim().toLowerCase() === 'true';
  const production = env.NODE_ENV === 'production';

  if (open) return 'open';
  if (codes.length > 0) return 'invite';
  return production ? 'closed' : 'open';
}

// Compare two strings in constant time so how long the check takes never hints
// at how many characters were right. Lengths are compared with the same
// primitive on fixed-size buffers, so a length mismatch does not short-circuit
// early either.
export function safeEqual(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  const size = Math.max(left.length, right.length, 1);
  const paddedLeft = Buffer.alloc(size);
  const paddedRight = Buffer.alloc(size);
  left.copy(paddedLeft);
  right.copy(paddedRight);
  const sameBytes = timingSafeEqual(paddedLeft, paddedRight);
  const sameLength = timingSafeEqual(
    Buffer.from([left.length & 0xff, (left.length >> 8) & 0xff]),
    Buffer.from([right.length & 0xff, (right.length >> 8) & 0xff])
  );
  // Both checks always run; combine with & (not &&) so neither is skipped.
  return Boolean(sameBytes & sameLength);
}

// True when `code` matches one of the configured invite codes. Every code in
// the list is compared (no early exit) so the timing is the same whichever
// entry matched — or none did.
export function isValidInviteCode(code, env = process.env) {
  if (typeof code !== 'string') return false;
  const candidate = code.trim();
  let matched = 0;
  for (const known of parseInviteCodes(env.SIGNUP_INVITE_CODES)) {
    matched |= safeEqual(candidate, known) ? 1 : 0;
  }
  return matched === 1;
}
