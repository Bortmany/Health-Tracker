// Page reloads (/auth/me), logout and invite-code redeem must NOT use up the
// strict password-guessing budget, while login and wrong invite codes stay capped.
process.env.DISABLE_RATE_LIMIT = 'false';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;
let cookie;

before(async () => {
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}/api`;
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `session-rl-${Date.now()}@example.com`, password: 'hunter2pass', displayName: 'Session RL' }),
  });
  cookie = res.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('/auth/me can be called 70 times in a row and never gets a 429', async () => {
  for (let i = 0; i < 70; i += 1) {
    const res = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200, `call ${i + 1}`);
  }
});

test('wrong invite codes are still capped, and a wrong-code flood does not affect /me', async () => {
  let blocked = false;
  for (let i = 0; i < 25; i += 1) {
    const res = await fetch(`${baseUrl}/coach-link/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ code: `nope-${i}` }),
    });
    if (res.status === 429) blocked = true;
    else assert.equal(res.status, 404);
  }
  assert.equal(blocked, true);
  const me = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
});

test('login is still capped per IP after 20 wrong passwords', async () => {
  let blocked = false;
  for (let i = 0; i < 25; i += 1) {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `nobody-${Date.now()}-${i}@example.com`, password: 'wrong-password-guess' }),
    });
    if (res.status === 429) blocked = true;
    else assert.equal(res.status, 401);
  }
  assert.equal(blocked, true);
});

test('logout is not caught by the strict 20-per-15-minutes limit', async () => {
  for (let i = 0; i < 30; i += 1) {
    const res = await fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.notEqual(res.status, 429, `logout ${i + 1}`);
  }
});
