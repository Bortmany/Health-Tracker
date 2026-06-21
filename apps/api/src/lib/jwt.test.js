import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { signToken, verifyToken } from './jwt.js';

before(() => {
  process.env.JWT_SECRET = 'test-secret';
});

test('signToken/verifyToken round-trip returns the original user id', () => {
  const userId = '123e4567-e89b-12d3-a456-426614174000';
  const token = signToken(userId);
  assert.equal(verifyToken(token), userId);
});

test('verifyToken rejects a tampered token', () => {
  const token = signToken('123e4567-e89b-12d3-a456-426614174000');
  const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'b' : 'a') + token.slice(-1);
  assert.throws(() => verifyToken(tampered));
});

test('verifyToken rejects a token signed with a different secret', () => {
  const token = signToken('123e4567-e89b-12d3-a456-426614174000');
  process.env.JWT_SECRET = 'a-different-secret';
  assert.throws(() => verifyToken(token));
  process.env.JWT_SECRET = 'test-secret';
});
