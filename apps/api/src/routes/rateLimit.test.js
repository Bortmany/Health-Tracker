// The rest of the suite runs with DISABLE_RATE_LIMIT=true so it isn't throttled.
// This file deliberately turns the limits back ON to prove they work — in
// particular the per-account login guard that stops one email being brute-forced
// even from many different IP addresses. The flag is read per-request, so setting
// it here (before any request) is enough.
process.env.DISABLE_RATE_LIMIT = 'false';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;

before(() => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

function login(email) {
  return fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'wrong-password-guess' }),
  });
}

test('login is capped per email: the 11th attempt on one account is blocked', async () => {
  const email = `ratelimit-target-${Date.now()}@example.com`;

  // The per-email limit is 10 in 15 minutes. The first 10 are normal failed
  // logins (401); the 11th is refused by the rate limiter (429).
  for (let i = 0; i < 10; i += 1) {
    const res = await login(email);
    assert.equal(res.status, 401, `attempt ${i + 1} should be a normal failed login`);
  }

  const blocked = await login(email);
  assert.equal(blocked.status, 429);
  const body = await blocked.json();
  assert.equal(body.error.code, 'RATE_LIMITED');
});

test('a different account is not blocked by another account being rate-limited', async () => {
  // Even after the account above hit its cap, a fresh email still gets a normal
  // response — the limit is per account, not a global lock.
  const res = await login(`ratelimit-other-${Date.now()}@example.com`);
  assert.equal(res.status, 401);
});
