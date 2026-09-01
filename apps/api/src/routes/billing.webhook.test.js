// Payments while they are switched ON. This file sets the Paddle variables
// before the app is loaded, so it exercises the real path: a webhook has to
// prove it came from Paddle, and only then does it move somebody's plan.
//
// Node runs each test file in its own process, so these variables never leak
// into the "switched off" tests in billing.test.js.

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';

const WEBHOOK_SECRET = 'test-webhook-secret-not-a-real-one';

process.env.PADDLE_API_KEY = 'test-api-key-not-a-real-one';
process.env.PADDLE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.PADDLE_PRICE_ID = 'pri_test';
process.env.PADDLE_ENV = 'sandbox';

let server;
let baseUrl;
let pool;
let cookie;
let userId;
let otherCookie;
let otherUserId;

// Signs a message the way Paddle does: HMAC-SHA256 over "timestamp:body",
// using the notification secret.
function sign(body, { secret = WEBHOOK_SECRET, seconds = Math.floor(Date.now() / 1000) } = {}) {
  const h1 = createHmac('sha256', secret).update(`${seconds}:${body}`).digest('hex');
  return `ts=${seconds};h1=${h1}`;
}

function post(body, signature) {
  return fetch(`${baseUrl}/billing/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signature ? { 'Paddle-Signature': signature } : {}),
    },
    body,
  });
}

async function planTierOf(id) {
  const { rows } = await pool.query('SELECT plan_tier FROM users WHERE id = $1', [id]);
  return rows[0].plan_tier;
}

before(async () => {
  // Loaded here, not at the top, so the variables above are already in place.
  const { app } = await import('../app.js');
  ({ pool } = await import('../db/pool.js'));

  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}/api`;

  const stamp = Date.now();
  const register = async (email) => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Webhook Test' }),
    });
    const setCookie = res.headers.get('set-cookie').split(';')[0];
    const body = await res.json();
    return { cookie: setCookie, id: body.user.id };
  };

  ({ cookie, id: userId } = await register(`paddle-hook-${stamp}@example.com`));
  ({ cookie: otherCookie, id: otherUserId } = await register(`paddle-hook-other-${stamp}@example.com`));
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('status says payments are switched on once the keys are set', async () => {
  const res = await fetch(`${baseUrl}/billing/status`, { headers: { Cookie: cookie } });
  const body = await res.json();
  assert.equal(body.enabled, true);
});

test('a webhook with no signature is refused', async () => {
  const res = await post(JSON.stringify({ event_type: 'subscription.activated' }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'INVALID_SIGNATURE');
});

test('a webhook signed with the wrong secret is refused', async () => {
  const body = JSON.stringify({
    event_id: 'evt_wrong',
    event_type: 'subscription.activated',
    data: { custom_data: { user_id: userId } },
  });
  const res = await post(body, sign(body, { secret: 'somebody-elses-secret' }));
  assert.equal(res.status, 400);
  assert.equal(await planTierOf(userId), 'free');
});

test('a signature copied onto a different message is refused', async () => {
  const original = JSON.stringify({
    event_id: 'evt_a',
    event_type: 'subscription.activated',
    data: { custom_data: { user_id: userId } },
  });
  const tampered = JSON.stringify({
    event_id: 'evt_a',
    event_type: 'subscription.activated',
    data: { custom_data: { user_id: otherUserId } },
  });
  const res = await post(tampered, sign(original));
  assert.equal(res.status, 400);
  assert.equal(await planTierOf(otherUserId), 'free');
});

test('an old webhook is refused as a replay', async () => {
  const body = JSON.stringify({
    event_id: 'evt_old',
    event_type: 'subscription.activated',
    data: { custom_data: { user_id: userId } },
  });
  const tenMinutesAgo = Math.floor(Date.now() / 1000) - 10 * 60;
  const res = await post(body, sign(body, { seconds: tenMinutesAgo }));
  assert.equal(res.status, 400);
  assert.equal(await planTierOf(userId), 'free');
});

test('a genuine activation turns Premium on for that person only', async () => {
  const body = JSON.stringify({
    event_id: 'evt_activate',
    event_type: 'subscription.activated',
    data: {
      id: 'sub_123',
      customer_id: 'ctm_123',
      status: 'active',
      custom_data: { user_id: userId },
    },
  });
  const res = await post(body, sign(body));
  assert.equal(res.status, 200);

  assert.equal(await planTierOf(userId), 'premium');
  // The other account is untouched — a webhook only ever moves the account it
  // names.
  assert.equal(await planTierOf(otherUserId), 'free');

  const status = await fetch(`${baseUrl}/billing/status`, { headers: { Cookie: cookie } }).then((r) => r.json());
  assert.equal(status.planTier, 'premium');
});

test('a failed payment does not take Premium away', async () => {
  const body = JSON.stringify({
    event_id: 'evt_failed',
    event_type: 'transaction.payment_failed',
    data: { customer_id: 'ctm_123', custom_data: { user_id: userId } },
  });
  const res = await post(body, sign(body));
  assert.equal(res.status, 200);
  assert.equal(await planTierOf(userId), 'premium');
});

test('a cancellation puts the account back on the free plan', async () => {
  const body = JSON.stringify({
    event_id: 'evt_cancel',
    event_type: 'subscription.canceled',
    data: { id: 'sub_123', customer_id: 'ctm_123', status: 'canceled' },
  });
  const res = await post(body, sign(body));
  assert.equal(res.status, 200);
  // No account id in this message — it was matched by the customer reference
  // saved when the subscription started.
  assert.equal(await planTierOf(userId), 'free');
  assert.equal(await planTierOf(otherUserId), 'free');
});

test('a renewal that only names the customer switches Premium back on', async () => {
  const body = JSON.stringify({
    event_id: 'evt_renew',
    event_type: 'subscription.updated',
    data: { id: 'sub_123', customer_id: 'ctm_123', status: 'active' },
  });
  const res = await post(body, sign(body));
  assert.equal(res.status, 200);
  assert.equal(await planTierOf(userId), 'premium');
  assert.equal(await planTierOf(otherUserId), 'free');
});

test('a webhook that is not readable JSON is refused', async () => {
  const body = 'this is not json';
  const res = await post(body, sign(body));
  assert.equal(res.status, 400);
  const parsed = await res.json();
  assert.equal(parsed.error.code, 'INVALID_WEBHOOK');
});

test('the checkout route still needs a login', async () => {
  const res = await fetch(`${baseUrl}/billing/checkout`, { method: 'POST' });
  assert.equal(res.status, 401);
});
