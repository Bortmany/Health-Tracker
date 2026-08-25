// The rest of the suite runs with DISABLE_RATE_LIMIT=true so it isn't throttled.
// This file deliberately turns the limits back ON to prove they work — in
// particular the per-account login guard that stops one email being brute-forced
// even from many different IP addresses. The flag is read per-request, so setting
// it here (before any request) is enough.
process.env.DISABLE_RATE_LIMIT = 'false';

import assert from 'node:assert/strict';
import { afterAll, beforeAll, test } from 'vitest';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;

beforeAll(() => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;
});

afterAll(async () => {
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

test('a real account\'s correct login still works while another account on the same IP is flooded with failed logins', async () => {
  // Register a legitimate account BEFORE the flood (register has its own bucket).
  const email = `ratelimit-legit-${Date.now()}@example.com`;
  const password = 'a-decent-password';
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: 'Legit User' }),
  });
  assert.equal(registerRes.status, 201);

  // Flood the SAME IP with wrong-password guesses against many OTHER accounts,
  // well past the per-IP failure budget of 20. Distinct emails keep the
  // per-account limiter from tripping, so only the per-IP failure bucket fills.
  for (let i = 0; i < 25; i += 1) {
    await login(`ratelimit-flood-${Date.now()}-${i}@example.com`);
  }

  // Despite the IP being far over its FAILED-login budget, the legitimate
  // account's CORRECT password still logs in: failed guesses from other accounts
  // must not lock a real user out on a shared IP.
  const goodLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(goodLogin.status, 200);
});

test('flooding login does not use up register\'s budget (separate per-IP buckets)', async () => {
  // The per-IP login limit is 20 in 15 minutes. Use 21 different emails so the
  // per-account guard (10/account) never kicks in — only the per-IP login
  // limiter should trip, and only for /login.
  let blocked = null;
  for (let i = 0; i < 21; i += 1) {
    const res = await login(`ratelimit-ip-flood-${Date.now()}-${i}@example.com`);
    if (res.status === 429) {
      blocked = res;
      break;
    }
  }
  assert.ok(blocked, 'login should eventually be blocked by the per-IP limiter');

  // Registration from the same IP should be unaffected — it has its own budget.
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `ratelimit-register-still-works-${Date.now()}@example.com`,
      password: 'a-decent-password',
      displayName: 'Rate Limit Test',
    }),
  });
  assert.equal(registerRes.status, 201);
});
