// Payments while they are switched OFF — the state the app ships in until the
// owner sets the payment variables. Every money button must answer with a plain
// "not switched on yet", never an error page, and nothing can move money or
// change a plan. The switched-ON paths are in billing.webhook.test.js and
// coachBilling.test.js (separate processes with the variables set).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';
import { moneyOff, startKit } from './moneyTestKit.js';

moneyOff();

let kit;
let student;
let other;
let coach;
let admin;

before(async () => {
  kit = startKit(app, pool);
  kit.start();
  student = await kit.register('dormant-student');
  other = await kit.register('dormant-other');
  coach = await kit.makeCoach('dormant-coach');
  admin = await kit.makeAdmin('dormant-admin');
});

after(async () => {
  await kit.stop();
});

test('status says switched off, with payouts and email off too, and plan only when signed in', async () => {
  const res = await kit.call(student, 'GET', '/billing/status');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.enabled, false);
  assert.equal(body.configured, false);
  assert.equal(body.planTier, 'free');
  assert.deepEqual(body.payouts, { configured: false, method: null });
  assert.equal(body.email.configured, false);
  assert.equal(body.aiPlanEnabled, Boolean(process.env.ANTHROPIC_API_KEY));

  // Public (the forgot-password screen reads it signed out): no plan then.
  const anon = await (await fetch(`${kit.baseUrl}/billing/status`)).json();
  assert.equal(anon.planTier, undefined);
  assert.equal(anon.configured, false);
  // Signed out: no payout method or other settings are revealed.
  assert.equal('payouts' in anon, false);
  assert.equal('aiPlanEnabled' in anon, false);
});

test('every checkout answers 503 BILLING_DISABLED while payments are off', async () => {
  for (const [who, path, body] of [
    [student, '/billing/checkout'],
    [student, '/billing/ai-checkout', { interval: 'month' }],
    [student, '/billing/coach-checkout', { coachId: coach.id }],
    [coach, '/coach/billing/startup-fee'],
    [coach, '/coach/billing/onboarding'],
  ]) {
    const res = await kit.call(who, 'POST', path, body);
    assert.equal(res.status, 503, path);
    assert.equal((await res.json()).error.code, 'BILLING_DISABLED', path);
  }
});

test('the webhook is refused with 503 while payments are off, and writes nothing', async () => {
  const res = await fetch(`${kit.baseUrl}/billing/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'msg_dormant', type: 'payment.succeeded', data: {} }),
  });
  assert.equal(res.status, 503);
  assert.equal((await pool.query(`SELECT 1 FROM billing_events WHERE event_id = 'msg_dormant'`)).rowCount, 0);
});

test('paying coaches says PAYOUTS_DISABLED when no payout method is chosen', async () => {
  const res = await kit.call(admin, 'POST', '/admin/payouts/run');
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'PAYOUTS_DISABLED');
});

test('/api/health reports money as dormant, in words only', async () => {
  const body = await (await fetch(`${kit.baseUrl}/health`)).json();
  assert.equal(body.billing.state, 'dormant');
  assert.equal(body.payouts.state, 'dormant');
  assert.equal(body.email.state, 'dormant');
});

test('subscription and money routes need a login', async () => {
  for (const path of ['/billing/subscriptions', '/coach/billing', '/coach/earnings', '/coach/payouts']) {
    assert.equal((await kit.call(null, 'GET', path)).status, 401, path);
  }
  assert.equal((await kit.call(null, 'POST', '/billing/checkout')).status, 401);
});

test('a brand-new account has no subscriptions, and each person only sees their own plan', async () => {
  const list = await (await kit.call(student, 'GET', '/billing/subscriptions')).json();
  assert.deepEqual(list.subscriptions, []);

  await pool.query(`UPDATE users SET plan_tier = 'premium' WHERE id = $1`, [student.id]);
  const mine = await (await kit.call(student, 'GET', '/billing/status')).json();
  const theirs = await (await kit.call(other, 'GET', '/billing/status')).json();
  assert.equal(mine.planTier, 'premium');
  assert.equal(theirs.planTier, 'free');
});

test('cancelling needs a real subscription id that belongs to you', async () => {
  assert.equal((await kit.call(student, 'POST', '/billing/subscriptions/not-a-uuid/cancel')).status, 404);
  assert.equal((await kit.call(student, 'POST', '/billing/subscriptions/00000000-0000-4000-8000-000000000000/cancel')).status, 404);
});

test('a student cannot reach the coach money screens; admin routes 404 for non-admins', async () => {
  assert.equal((await kit.call(student, 'GET', '/coach/billing')).status, 403);
  assert.equal((await kit.call(student, 'PUT', '/coach/billing/price', { priceCents: 3000 })).status, 403);
  for (const [method, path] of [['GET', '/admin/coaches/earnings'], ['POST', '/admin/payouts/run'], ['GET', '/admin/payouts']]) {
    const res = await kit.call(coach, method, path);
    assert.equal(res.status, 404, path);
  }
});
