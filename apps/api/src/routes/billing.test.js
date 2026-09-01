// Payments while they are switched OFF — the state the app ships in until the
// owner sets the Paddle variables. The webhook's signature checking and the
// plan changes it makes are tested separately in billing.webhook.test.js,
// which runs in its own process with the variables set.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;
let cookie;
let otherCookie;

before(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;

  const stamp = Date.now();
  const register = async (email) => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Billing Test' }),
    });
    return res.headers.get('set-cookie').split(';')[0];
  };

  cookie = await register(`billing-test-${stamp}@example.com`);
  otherCookie = await register(`billing-other-${stamp}@example.com`);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('billing status reports switched off when no Paddle keys are set', async () => {
  const res = await fetch(`${baseUrl}/billing/status`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.enabled, false);
  assert.equal(body.planTier, 'free');
});

test('checkout gives a friendly message while payments are switched off', async () => {
  const res = await fetch(`${baseUrl}/billing/checkout`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error.code, 'BILLING_DISABLED');
});

test('the webhook is refused while payments are switched off', async () => {
  const res = await fetch(`${baseUrl}/billing/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: 'subscription.activated' }),
  });
  assert.equal(res.status, 503);
});

test('billing status needs a login', async () => {
  const res = await fetch(`${baseUrl}/billing/status`);
  assert.equal(res.status, 401);
});

test('each person only ever sees their own plan', async () => {
  // Make the first account Premium by hand, exactly as the owner would.
  const { user } = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } }).then((r) => r.json());
  await pool.query(`UPDATE users SET plan_tier = 'premium' WHERE id = $1::uuid`, [user.id]);

  const mine = await fetch(`${baseUrl}/billing/status`, { headers: { Cookie: cookie } }).then((r) => r.json());
  const theirs = await fetch(`${baseUrl}/billing/status`, { headers: { Cookie: otherCookie } }).then((r) => r.json());

  assert.equal(mine.planTier, 'premium');
  assert.equal(theirs.planTier, 'free');
});
