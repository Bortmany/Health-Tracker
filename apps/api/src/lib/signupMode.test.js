import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSignupMode, isValidInviteCode, parseInviteCodes, safeEqual } from './signupMode.js';

// These tests pass a fake env object instead of touching process.env, so they
// never interfere with the API tests running alongside them.

test('production with nothing set is CLOSED (safe default)', () => {
  assert.equal(getSignupMode({ NODE_ENV: 'production' }), 'closed');
});

test('production with codes set is INVITE-only', () => {
  assert.equal(getSignupMode({ NODE_ENV: 'production', SIGNUP_INVITE_CODES: 'friends-2026' }), 'invite');
});

test('production with SIGNUPS_OPEN=true is OPEN even when codes exist', () => {
  assert.equal(getSignupMode({ NODE_ENV: 'production', SIGNUPS_OPEN: 'true', SIGNUP_INVITE_CODES: 'friends-2026' }), 'open');
  // Only the exact word "true" opens it — "yes" or "1" do not.
  assert.equal(getSignupMode({ NODE_ENV: 'production', SIGNUPS_OPEN: 'yes' }), 'closed');
});

test('development and test are OPEN unless codes are set', () => {
  assert.equal(getSignupMode({ NODE_ENV: 'development' }), 'open');
  assert.equal(getSignupMode({ NODE_ENV: 'test' }), 'open');
  assert.equal(getSignupMode({}), 'open');
  assert.equal(getSignupMode({ NODE_ENV: 'development', SIGNUP_INVITE_CODES: 'friends-2026' }), 'invite');
});

test('parseInviteCodes trims, skips blanks, and drops codes under 8 characters', () => {
  assert.deepEqual(parseInviteCodes(' friends-2026 , short ,, gym-buddies-1 '), ['friends-2026', 'gym-buddies-1']);
  assert.deepEqual(parseInviteCodes(undefined), []);
  assert.deepEqual(parseInviteCodes(''), []);
});

test('a code that is only made of short entries counts as no codes at all', () => {
  assert.equal(getSignupMode({ NODE_ENV: 'production', SIGNUP_INVITE_CODES: 'abc,1234567' }), 'closed');
});

test('isValidInviteCode accepts a right code (any position, trimmed) and rejects a wrong one', () => {
  const env = { SIGNUP_INVITE_CODES: 'friends-2026,gym-buddies-1' };
  assert.equal(isValidInviteCode('friends-2026', env), true);
  assert.equal(isValidInviteCode('gym-buddies-1', env), true);
  assert.equal(isValidInviteCode('  gym-buddies-1 ', env), true);
  assert.equal(isValidInviteCode('friends-2025', env), false);
  assert.equal(isValidInviteCode('FRIENDS-2026', env), false);
  assert.equal(isValidInviteCode('', env), false);
  assert.equal(isValidInviteCode(undefined, env), false);
  assert.equal(isValidInviteCode(12345678, env), false);
  // No codes configured: nothing is valid.
  assert.equal(isValidInviteCode('friends-2026', {}), false);
});

test('safeEqual compares in constant time and handles unequal lengths', () => {
  assert.equal(safeEqual('friends-2026', 'friends-2026'), true);
  assert.equal(safeEqual('friends-2026', 'friends-2027'), false);
  assert.equal(safeEqual('friends-2026', 'friends-202'), false);
  assert.equal(safeEqual('friends-2026', 'friends-20260'), false);
  assert.equal(safeEqual('', ''), true);
  assert.equal(safeEqual('a', ''), false);
  // A prefix match with a longer string must not pass (padding must not make
  // "abc" equal "abc\0").
  assert.equal(safeEqual('abc', 'abc\0'), false);
});
