// Plain rules for "am I signed out?" (no React, so each has a small test).
// Only a 401 from the server means the person is signed out. A 429 (too many
// requests), a 500 or a dropped network is a hiccup: the person stays signed
// in on screen and we ask again a little later.

export function isSignedOutError(status) {
  return status === 401;
}

// Retry hiccups a few times, with growing waits; never retry a real 401.
export const ME_MAX_RETRIES = 4;

export function shouldRetryMe(failureCount, error) {
  if (isSignedOutError(error?.status)) return false;
  return failureCount < ME_MAX_RETRIES;
}

// 1s, 2s, 4s, 8s ... never longer than 10s.
export function meRetryDelay(attempt) {
  return Math.min(1000 * 2 ** attempt, 10000);
}

// After the retries run out with no saved user, keep asking every 15 seconds
// (and only then): the screen shows "trying again", not the login page.
export const ME_REASK_MS = 15000;
