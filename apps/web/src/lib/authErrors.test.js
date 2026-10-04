// Plain-logic tests for the signed-out decision (run with `npm test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSignedOutError, meRetryDelay, ME_MAX_RETRIES, shouldRetryMe } from './authErrors.js';

test('only a 401 means signed out', () => {
  assert.equal(isSignedOutError(401), true);
  for (const s of [429, 500, 502, 503, 404, 0, undefined, null]) {
    assert.equal(isSignedOutError(s), false);
  }
});

test('hiccups are retried, a 401 is not', () => {
  assert.equal(shouldRetryMe(0, { status: 429 }), true);
  assert.equal(shouldRetryMe(0, new TypeError('Failed to fetch')), true);
  assert.equal(shouldRetryMe(ME_MAX_RETRIES, { status: 429 }), false);
  assert.equal(shouldRetryMe(0, { status: 401 }), false);
});

test('retry waits grow and stop at 10 seconds', () => {
  assert.equal(meRetryDelay(0), 1000);
  assert.equal(meRetryDelay(2), 4000);
  assert.equal(meRetryDelay(10), 10000);
});
