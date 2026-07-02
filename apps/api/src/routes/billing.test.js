import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;
let cookie;

before(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;

  const email = `billing-test-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Billing Test' }),
  });
  cookie = registerRes.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('billing status reports disabled when no Stripe keys are set', async () => {
  const res = await fetch(`${baseUrl}/billing/status`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.enabled, false);
  assert.equal(body.planTier, 'free');
});

test('checkout gives a friendly message while billing is switched off', async () => {
  const res = await fetch(`${baseUrl}/billing/checkout`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error.code, 'BILLING_DISABLED');
});

test('the webhook rejects calls while billing is switched off', async () => {
  const res = await fetch(`${baseUrl}/billing/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'checkout.session.completed' }),
  });
  assert.equal(res.status, 503);
});
