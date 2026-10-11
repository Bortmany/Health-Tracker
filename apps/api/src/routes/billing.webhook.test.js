// Payments switched ON, fully offline: webhooks are signed with a throwaway
// secret and the payment company is a fake. Proves that only a genuine, fresh,
// first-time message can change anything, and that every money row is written
// exactly once with the right split.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { moneyOn, startKit, createFakeBillingClient, WEBHOOK_SECRET } from './moneyTestKit.js';

moneyOn({ method: 'B' });

let kit;
let pool;
let setBillingClient;

before(async () => {
  const { app } = await import('../app.js');
  ({ pool } = await import('../db/pool.js'));
  ({ setBillingClient } = await import('../lib/billing/index.js'));
  kit = startKit(app, pool);
  kit.start();
  setBillingClient(createFakeBillingClient());
});

after(async () => {
  setBillingClient(null);
  await kit.stop();
});

const ledgerFor = async (coachId) =>
  (await pool.query('SELECT * FROM commission_ledger WHERE coach_id = $1 ORDER BY created_at, id', [coachId])).rows;
const planOf = async (id) => (await pool.query('SELECT plan_tier FROM users WHERE id = $1', [id])).rows[0].plan_tier;
const linkOf = async (id) => (await pool.query('SELECT status FROM coach_clients WHERE id = $1', [id])).rows[0].status;

// One paid coaching link, ready for payment messages.
async function setup(label, priceCents = 3000) {
  const coach = await kit.makeCoach(label, { ready: true, priceCents });
  const student = await kit.register(`${label}-student`);
  const linkId = await kit.acceptedLink(coach, student);
  return { coach, student, linkId };
}

function paymentFields({ coach, student, linkId }, extra = {}) {
  return {
    id: `pay_${kit.run}_${Math.random().toString(36).slice(2, 8)}`,
    total: 30,
    membership_id: `mem_${kit.run}_${coach.id.slice(0, 6)}`,
    user_id: 'user_cust1',
    metadata: { userId: student.id, kind: 'coach_student', coachUserId: coach.id, linkId, interval: 'month' },
    ...extra,
  };
}

test('status says payments are on and payouts configured', async () => {
  // Signed out: only on/off (and email), never the payout method.
  const anon = await (await fetch(`${kit.baseUrl}/billing/status`)).json();
  assert.equal(anon.enabled, true);
  assert.equal(anon.configured, true);
  assert.equal('payouts' in anon, false);
  const someone = await kit.register('status-reader');
  const body = await (await kit.call(someone, 'GET', '/billing/status')).json();
  assert.equal(body.enabled, true);
  assert.equal(body.configured, true);
  assert.deepEqual(body.payouts, { configured: true, method: 'B' });
});

test('a message with no signature, a wrong signature or an old timestamp writes nothing', async () => {
  const s = await setup('badsig');
  const fields = paymentFields(s);

  // No signature headers at all.
  const bare = await fetch(`${kit.baseUrl}/billing/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'msg_x', type: 'payment.succeeded', data: fields }),
  });
  assert.equal(bare.status, 400);
  assert.equal((await bare.json()).error.code, 'INVALID_SIGNATURE');

  // Signed with somebody else's secret.
  const wrong = await kit.webhook('payment.succeeded', fields, { secret: 'somebody-elses-secret' });
  assert.equal(wrong.status, 400);

  // Genuine signature but ten minutes old (a replayed capture).
  const stale = await kit.webhook('payment.succeeded', fields, { timestamp: Math.floor(Date.now() / 1000) - 600 });
  assert.equal(stale.status, 400);

  assert.equal((await ledgerFor(s.coach.id)).length, 0);
  assert.equal(await linkOf(s.linkId), 'pending_payment');
  assert.equal((await pool.query('SELECT 1 FROM student_subscriptions WHERE user_id = $1', [s.student.id])).rowCount, 0);
});

test('a genuine payment activates the link, writes one ledger row at 15%, and a replay changes nothing', async () => {
  const s = await setup('firstpay');
  assert.equal(await linkOf(s.linkId), 'pending_payment');
  const fields = paymentFields(s);

  const res = await kit.webhook('payment.succeeded', fields, { id: `msg_${kit.run}_fixed1` });
  assert.equal(res.status, 200);
  assert.equal(await linkOf(s.linkId), 'active');

  const rows = await ledgerFor(s.coach.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].gross_cents, 3000);
  assert.equal(rows[0].commission_cents, 450);
  assert.equal(rows[0].coach_cents, 2550);
  assert.equal(rows[0].rate_bps, 1500);
  assert.equal(rows[0].settled_by, 'cut');
  assert.equal(rows[0].kind, 'payment');
  assert.equal(rows[0].student_id, s.student.id);

  // Same message again (same id): recognised as a duplicate.
  const again = await kit.webhook('payment.succeeded', fields, { id: `msg_${kit.run}_fixed1` });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
  // Same payment under a NEW message id: the ledger's unique reference still blocks a second row.
  const renamed = await kit.webhook('payment.succeeded', fields);
  assert.equal(renamed.status, 200);
  assert.equal((await ledgerFor(s.coach.id)).length, 1);
  assert.equal((await pool.query('SELECT 1 FROM student_subscriptions WHERE user_id = $1', [s.student.id])).rowCount, 1);
});

test('a student sees the link live; no coach money reaches the student side', async () => {
  const s = await setup('studentview');
  await kit.webhook('payment.succeeded', paymentFields(s));
  const mine = await (await kit.call(s.student, 'GET', '/coach-link')).json();
  assert.equal(mine.coach.displayName, 'studentview User');
  assert.equal(mine.pendingPayment, null);
  const subs = await (await kit.call(s.student, 'GET', '/billing/subscriptions')).json();
  assert.equal(subs.subscriptions.length, 1);
  assert.equal(subs.subscriptions[0].kind, 'coach');
  assert.equal(subs.subscriptions[0].priceCents, 3000);
  // Only what the student pays: no commission, no coach figures anywhere.
  const text = JSON.stringify(subs);
  assert.doesNotMatch(text, /commission|coachCents|rate/i);
  // The student is not allowed into the coach's money screens.
  assert.equal((await kit.call(s.student, 'GET', '/coach/earnings')).status, 403);
  assert.equal((await kit.call(s.student, 'GET', '/coach/billing')).status, 403);
});

test('an invite-code student stays free: no subscription, no ledger row', async () => {
  const coach = await kit.makeCoach('freecoach', { ready: true });
  const student = await kit.register('freecoach-student');
  const { inviteCode } = await (await kit.call(coach, 'POST', '/coach/invites')).json();
  const redeem = await kit.call(student, 'POST', '/coach-link/redeem', { code: inviteCode });
  assert.equal(redeem.status, 200);
  assert.equal((await ledgerFor(coach.id)).length, 0);
  assert.equal((await pool.query('SELECT 1 FROM student_subscriptions WHERE user_id = $1', [student.id])).rowCount, 0);
  const mine = await (await kit.call(student, 'GET', '/coach-link')).json();
  assert.ok(mine.coach);
});

test('15% below 20 paying students, 10% from the 20th, and a half cent rounds up', async () => {
  const coach = await kit.makeCoach('bigcoach', { ready: true, priceCents: 1001 });
  // 19 students already paying this coach (inserted directly, as if earlier payments had landed).
  for (let i = 0; i < 19; i += 1) {
    const st = await kit.register(`bigcoach-old-${i}`);
    const { rows } = await pool.query(
      `INSERT INTO coach_clients (coach_id, client_id, status, requested_by) VALUES ($1, $2, 'active', 'coach') RETURNING id`,
      [coach.id, st.id]
    );
    await pool.query(
      `INSERT INTO student_subscriptions (user_id, coach_client_id, kind, interval, price_cents, provider_subscription_id)
       VALUES ($1, $2, 'coach', 'month', 1001, $3)`,
      [st.id, rows[0].id, `mem_old_${kit.run}_${i}`]
    );
  }
  // The 20th student pays: the count at that payment is 20, so 10%.
  const s20 = await kit.register('bigcoach-20');
  const link20 = await kit.acceptedLink(coach, s20);
  await kit.webhook('payment.succeeded', {
    id: `pay_${kit.run}_20`, total: 10.01, membership_id: `mem_${kit.run}_20`, user_id: 'u',
    metadata: { userId: s20.id, kind: 'coach_student', coachUserId: coach.id, linkId: link20, interval: 'month' },
  });
  const rows = await ledgerFor(coach.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rate_bps, 1000);
  // 10% of 1001 = 100.1 -> 100
  assert.equal(rows[0].commission_cents, 100);
  assert.equal(rows[0].coach_cents, 901);
});

test('a half cent rounds up in Cut\'s favour at 15%', async () => {
  // 15% of $0.50 amounts is unreachable (price floor), so use $10.10: 151.5 -> 152.
  const s = await setup('rounding', 1010);
  await kit.webhook('payment.succeeded', paymentFields(s, { total: 10.1 }));
  const [row] = await ledgerFor(s.coach.id);
  assert.equal(row.commission_cents, 152);
  assert.equal(row.coach_cents, 858);
  assert.equal(row.gross_cents, row.commission_cents + row.coach_cents);
});

test('a refund writes a negative row at the original rate, once', async () => {
  const s = await setup('refund');
  const fields = paymentFields(s);
  await kit.webhook('payment.succeeded', fields);
  const refund = { id: `rf_${kit.run}_1`, payment_id: fields.id, amount: 30, status: 'succeeded' };
  assert.equal((await kit.webhook('refund.created', refund)).status, 200);
  // The provider sends the same refund again as an update: still one row.
  assert.equal((await kit.webhook('refund.updated', refund)).status, 200);
  const rows = await ledgerFor(s.coach.id);
  assert.equal(rows.length, 2);
  const neg = rows.find((r) => r.kind === 'refund');
  assert.equal(neg.gross_cents, -3000);
  assert.equal(neg.commission_cents, -450);
  assert.equal(neg.coach_cents, -2550);
  assert.equal(neg.rate_bps, 1500);
  assert.equal(rows.reduce((sum, r) => sum + r.coach_cents, 0), 0);
});

test('a refund that has not succeeded yet is ignored', async () => {
  const s = await setup('pendingrefund');
  const fields = paymentFields(s);
  await kit.webhook('payment.succeeded', fields);
  await kit.webhook('refund.created', { id: `rf_${kit.run}_p`, payment_id: fields.id, amount: 30, status: 'pending' });
  assert.equal((await ledgerFor(s.coach.id)).length, 1);
});

test('a chargeback writes a negative row', async () => {
  const s = await setup('chargeback');
  const fields = paymentFields(s);
  await kit.webhook('payment.succeeded', fields);
  await kit.webhook('dispute.created', { id: `dsp_${kit.run}`, amount: 30, payment: { id: fields.id } });
  const rows = await ledgerFor(s.coach.id);
  const neg = rows.find((r) => r.kind === 'chargeback');
  assert.ok(neg);
  assert.equal(neg.coach_cents, -2550);
});

test('a failed renewal keeps access; ending the subscription turns the link off', async () => {
  const s = await setup('lifecycle');
  const fields = paymentFields(s);
  await kit.webhook('payment.succeeded', fields);
  assert.equal(await linkOf(s.linkId), 'active');

  await kit.webhook('payment.failed', { id: `pay_${kit.run}_f`, membership_id: fields.membership_id, total: 30 });
  assert.equal(await linkOf(s.linkId), 'active');
  const past = await pool.query('SELECT status FROM student_subscriptions WHERE user_id = $1', [s.student.id]);
  assert.equal(past.rows[0].status, 'past_due');

  // Cancelling keeps access until the period ends.
  await kit.webhook('membership.cancel_at_period_end_changed', {
    id: fields.membership_id, cancel_at_period_end: true, current_period_end: '2030-01-31T00:00:00.000Z',
  });
  assert.equal(await linkOf(s.linkId), 'active');
  const cancelled = await pool.query('SELECT cancel_at_period_end FROM student_subscriptions WHERE user_id = $1', [s.student.id]);
  assert.equal(cancelled.rows[0].cancel_at_period_end, true);

  await kit.webhook('membership.deactivated', { id: fields.membership_id, status: 'canceled' });
  assert.equal(await linkOf(s.linkId), 'ended');
  const ended = await pool.query('SELECT status FROM student_subscriptions WHERE user_id = $1', [s.student.id]);
  assert.equal(ended.rows[0].status, 'ended');
});

test('the AI plan flips to premium only from a verified payment and back on end', async () => {
  const student = await kit.register('aiplan');
  assert.equal(await planOf(student.id), 'free');

  // Starting checkout changes nothing.
  const checkout = await kit.call(student, 'POST', '/billing/ai-checkout', { interval: 'year' });
  assert.equal(checkout.status, 200);
  const co = await checkout.json();
  assert.ok(co.checkoutUrl && co.url);
  assert.equal(await planOf(student.id), 'free');

  // A forged message (bad signature) changes nothing.
  const forged = await kit.webhook('payment.succeeded', { id: 'pay_forged', total: 89.99, membership_id: 'mem_forged', metadata: { userId: student.id, kind: 'ai_plan', interval: 'year' } }, { secret: 'nope' });
  assert.equal(forged.status, 400);
  assert.equal(await planOf(student.id), 'free');

  const memId = `mem_${kit.run}_ai`;
  await kit.webhook('payment.succeeded', { id: `pay_${kit.run}_ai`, total: 89.99, membership_id: memId, metadata: { userId: student.id, kind: 'ai_plan', interval: 'year' } });
  assert.equal(await planOf(student.id), 'premium');
  const subs = await (await kit.call(student, 'GET', '/billing/subscriptions')).json();
  assert.equal(subs.subscriptions[0].kind, 'ai_yearly');

  // Already subscribed: a second checkout is refused.
  assert.equal((await kit.call(student, 'POST', '/billing/ai-checkout', { interval: 'month' })).status, 409);

  // Cancel: still premium until the period ends, then the end message flips it.
  const cancel = await kit.call(student, 'POST', `/billing/subscriptions/${subs.subscriptions[0].id}/cancel`);
  assert.equal(cancel.status, 200);
  assert.equal(await planOf(student.id), 'premium');
  await kit.webhook('membership.deactivated', { id: memId, status: 'canceled' });
  assert.equal(await planOf(student.id), 'free');
});

test('a person can only cancel their own subscription', async () => {
  const a = await kit.register('cancel-a');
  const b = await kit.register('cancel-b');
  await kit.webhook('payment.succeeded', { id: `pay_${kit.run}_ca`, total: 12.99, membership_id: `mem_${kit.run}_ca`, metadata: { userId: a.id, kind: 'ai_plan', interval: 'month' } });
  const subs = await (await kit.call(a, 'GET', '/billing/subscriptions')).json();
  assert.equal((await kit.call(b, 'POST', `/billing/subscriptions/${subs.subscriptions[0].id}/cancel`)).status, 404);
  assert.equal((await (await kit.call(b, 'GET', '/billing/subscriptions')).json()).subscriptions.length, 0);
});

test('the startup fee message marks the coach as paid; an identity message marks them verified', async () => {
  const coach = await kit.makeCoach('feepay');
  await kit.webhook('payment.succeeded', { id: `pay_${kit.run}_fee`, total: 49, metadata: { userId: coach.id, kind: 'coach_startup_fee' } });
  let billing = await (await kit.call(coach, 'GET', '/coach/billing')).json();
  assert.ok(billing.startupFeePaidOn);
  assert.equal(billing.identityVerified, false);

  // Account link comes from the onboarding call; verification arrives by webhook.
  const onboarding = await kit.call(coach, 'POST', '/coach/billing/onboarding');
  assert.equal(onboarding.status, 200);
  const { rows } = await pool.query('SELECT provider_account_id FROM coach_subscriptions WHERE coach_id = $1', [coach.id]);
  await kit.webhook('verification.succeeded', {}, { account: rows[0].provider_account_id });
  billing = await (await kit.call(coach, 'GET', '/coach/billing')).json();
  assert.equal(billing.identityVerified, true);
  assert.equal(billing.active, true);
  assert.equal(billing.priceCents, null);
});

test('a message about someone unknown is acknowledged and ignored', async () => {
  const res = await kit.webhook('payment.succeeded', { id: 'pay_nobody', total: 30, metadata: { userId: '00000000-0000-4000-8000-000000000000', kind: 'ai_plan' } });
  assert.equal(res.status, 200);
  const unreadable = await fetch(`${kit.baseUrl}/billing/webhook`, { method: 'POST', body: 'not json' });
  assert.equal(unreadable.status, 400);
});

const subRowFor = async (studentId) =>
  (await pool.query('SELECT * FROM student_subscriptions WHERE user_id = $1 ORDER BY created_at', [studentId])).rows;
const cancelCalls = (fake) => fake.calls.filter((c) => c.method === 'cancelSubscription').map((c) => c.args.providerSubscriptionId);

test('a paid link that cannot go live (student already has another coach) is cancelled at the provider and kept so the student can cancel', async () => {
  const fake = createFakeBillingClient();
  setBillingClient(fake);
  const first = await setup('blocka');
  await kit.webhook('payment.succeeded', paymentFields(first));
  assert.equal(await linkOf(first.linkId), 'active');

  // A second coach's link was waiting for payment while the student already has an active coach.
  const second = await kit.makeCoach('blockb', { ready: true });
  const { rows } = await pool.query(
    `INSERT INTO coach_clients (coach_id, client_id, status, requested_by) VALUES ($1, $2, 'pending_payment', 'coach') RETURNING id`,
    [second.id, first.student.id]
  );
  const fields = paymentFields({ coach: second, student: first.student, linkId: rows[0].id });
  assert.equal((await kit.webhook('payment.succeeded', fields)).status, 200);

  assert.equal(await linkOf(rows[0].id), 'pending_payment');
  assert.deepEqual(cancelCalls(fake), [fields.membership_id]);
  const stored = (await subRowFor(first.student.id)).find((r) => r.provider_subscription_id === fields.membership_id);
  assert.ok(stored, 'the subscription row is kept');
  assert.equal(stored.cancel_at_period_end, true);
  // The coach is NOT credited: the payment and its automatic refund net to zero.
  const secondRows = await ledgerFor(second.id);
  assert.equal(secondRows.length, 2);
  assert.equal(secondRows.reduce((sum, r) => sum + r.coach_cents, 0), 0);
  assert.deepEqual(fake.calls.filter((c) => c.method === 'refundPayment').map((c) => c.args.providerPaymentId), [fields.id]);
});

test('a payment for a dead link cancels the subscription at the provider and keeps no row', async () => {
  const fake = createFakeBillingClient();
  setBillingClient(fake);
  const s = await setup('deadlink');
  await pool.query(`UPDATE coach_clients SET status = 'declined' WHERE id = $1`, [s.linkId]);
  const fields = paymentFields(s);
  assert.equal((await kit.webhook('payment.succeeded', fields)).status, 200);
  assert.deepEqual(cancelCalls(fake), [fields.membership_id]);
  assert.equal((await subRowFor(s.student.id)).length, 0);
  // Not credited: payment and refund net to zero, and the student is refunded.
  const rows = await ledgerFor(s.coach.id);
  assert.equal(rows.reduce((sum, r) => sum + r.coach_cents, 0), 0);
  assert.deepEqual(fake.calls.filter((c) => c.method === 'refundPayment').map((c) => c.args.providerPaymentId), [fields.id]);
});

test('a second subscription for the same link is cancelled at the provider; the first stays', async () => {
  const fake = createFakeBillingClient();
  setBillingClient(fake);
  const s = await setup('dupsub');
  const first = paymentFields(s);
  await kit.webhook('payment.succeeded', first);
  const extra = paymentFields(s, { membership_id: `mem_${kit.run}_extra` });
  await kit.webhook('payment.succeeded', extra);
  assert.deepEqual(cancelCalls(fake), [`mem_${kit.run}_extra`]);
  const rows = await subRowFor(s.student.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provider_subscription_id, first.membership_id);
  assert.equal(await linkOf(s.linkId), 'active');
});

test('a payment that is not in US dollars credits nothing but leaves a flagged, held row for the owner, and answers 200', async () => {
  setBillingClient(createFakeBillingClient());
  const s = await setup('eurpay');
  const res = await kit.webhook('payment.succeeded', paymentFields(s, { currency: 'eur' }));
  assert.equal(res.status, 200);
  const rows = await ledgerFor(s.coach.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].owner_flag, 'non_usd_payment');
  assert.equal(rows[0].coach_cents, 0);
});

test('stopping subscriptions: a provider failure leaves it NOT cancelled so the next attempt retries; success marks it', async () => {
  const { stopSubscriptionsWhere } = await import('../lib/stopSubscriptions.js');
  const s = await setup('stopsubs');
  await kit.webhook('payment.succeeded', paymentFields(s));
  const flag = async () => (await subRowFor(s.student.id))[0].cancel_at_period_end;

  setBillingClient(createFakeBillingClient({ failOn: 'cancelSubscription' }));
  await stopSubscriptionsWhere('cc.id = $1', [s.linkId]);
  assert.equal(await flag(), false);
  // ...and the failed cancel is saved, once, for a later retry.
  assert.equal((await pool.query('SELECT 1 FROM pending_cancels')).rowCount > 0, true);

  const ok = createFakeBillingClient();
  setBillingClient(ok);
  await stopSubscriptionsWhere('cc.id = $1', [s.linkId]);
  assert.equal(await flag(), true);
  assert.equal(cancelCalls(ok).length, 1);
});

test('the webhook secret is never echoed in /api/health', async () => {
  const text = await (await fetch(`${kit.baseUrl}/health`)).text();
  assert.doesNotMatch(text, new RegExp(WEBHOOK_SECRET));
  assert.doesNotMatch(text, /test-api-key/);
});
