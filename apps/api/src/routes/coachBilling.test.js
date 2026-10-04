// A coach's money: the three steps before taking a paying student, what they
// see (and never see), and the owner's "pay coaches now" under Method B, with
// the payment company played by a fake. Nothing here touches a network.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { moneyOn, startKit, createFakeBillingClient } from './moneyTestKit.js';

moneyOn({ method: 'B' });

let kit;
let pool;
let setBillingClient;
let fake;
let admin;

before(async () => {
  const { app } = await import('../app.js');
  ({ pool } = await import('../db/pool.js'));
  ({ setBillingClient } = await import('../lib/billing/index.js'));
  kit = startKit(app, pool);
  kit.start();
  admin = await kit.makeAdmin('cb-admin');
});

after(async () => {
  setBillingClient(null);
  await kit.stop();
});

function useFake(options) {
  fake = createFakeBillingClient(options);
  setBillingClient(fake);
  return fake;
}

// Puts money straight on a coach's books: one paid-in coaching payment.
async function addPayment(coachId, studentId, { gross = 3000, ref, settledBy = 'cut' } = {}) {
  const commission = Math.floor((gross * 1500 + 5000) / 10000);
  await pool.query(
    `INSERT INTO commission_ledger (coach_id, student_id, gross_cents, commission_cents, coach_cents, rate_bps, source_ref, kind, settled_by)
     VALUES ($1, $2, $3, $4, $5, 1500, $6, 'payment', $7)`,
    [coachId, studentId, gross, commission, gross - commission, ref ?? `payment:t_${Math.random()}`, settledBy]
  );
}

test('billing summary starts empty and has the price limits and rate', async () => {
  useFake();
  const coach = await kit.makeCoach('cb-new');
  const res = await kit.call(coach, 'GET', '/coach/billing');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.startupFeePaidOn, null);
  assert.equal(body.identityVerified, false);
  assert.equal(body.active, false);
  assert.equal(body.priceCents, null);
  assert.equal(body.minPriceCents, 1000);
  assert.equal(body.maxPriceCents, 50000);
  assert.equal(body.payingStudents, 0);
  assert.equal(body.ratePercent, 15);
});

test('price: under $10, over $500, decimals and junk are refused; a good price is saved', async () => {
  const coach = await kit.makeCoach('cb-price');
  for (const bad of [999, 0, -5, 50001, 1234.5, '3000', null, undefined]) {
    const res = await kit.call(coach, 'PUT', '/coach/billing/price', { priceCents: bad });
    assert.equal(res.status, 400, String(bad));
    assert.equal((await res.json()).error.code, 'INVALID_PRICE');
  }
  const ok = await kit.call(coach, 'PUT', '/coach/billing/price', { priceCents: 1000 });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).priceCents, 1000);
  assert.equal((await (await kit.call(coach, 'PUT', '/coach/billing/price', { priceCents: 50000 })).json()).priceCents, 50000);
});

test('the startup fee opens checkout once; onboarding needs the fee first', async () => {
  useFake();
  const coach = await kit.makeCoach('cb-steps');
  const early = await kit.call(coach, 'POST', '/coach/billing/onboarding');
  assert.equal(early.status, 409);
  assert.equal((await early.json()).error.code, 'STARTUP_FEE_REQUIRED');

  const fee = await kit.call(coach, 'POST', '/coach/billing/startup-fee');
  assert.equal(fee.status, 200);
  const feeBody = await fee.json();
  assert.ok(feeBody.checkoutUrl.startsWith('https://'));
  const call = fake.calls.find((c) => c.method === 'createCheckout');
  assert.equal(call.args.kind, 'coach_startup_fee');
  assert.equal(call.args.amountCents, 4900);
  assert.equal(call.args.userId, coach.id);

  await pool.query(`INSERT INTO coach_subscriptions (coach_id, startup_fee_paid_at) VALUES ($1, now())`, [coach.id]);
  assert.equal((await kit.call(coach, 'POST', '/coach/billing/startup-fee')).status, 409);

  const onboarding = await kit.call(coach, 'POST', '/coach/billing/onboarding');
  assert.equal(onboarding.status, 200);
  assert.ok((await onboarding.json()).url);
  const args = fake.calls.find((c) => c.method === 'createCoachOnboardingLink').args;
  assert.equal(args.email, coach.email);
  assert.equal(args.name, 'cb-steps User');
  // Calling it does NOT verify anybody: that only arrives by signed webhook.
  assert.equal((await (await kit.call(coach, 'GET', '/coach/billing')).json()).identityVerified, false);
});

test('a coach who is not set up cannot accept a student; a ready one can (link waits for payment)', async () => {
  useFake();
  const unready = await kit.makeCoach('cb-unready');
  const s1 = await kit.register('cb-unready-student');
  const request = await (await kit.call(s1, 'POST', '/coach-link/requests', { coachSlug: unready.slug })).json();

  const refused = await kit.call(unready, 'POST', `/coach/requests/${request.request.id}/accept`);
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).error.code, 'COACH_NOT_READY');
  const stillOpen = await pool.query('SELECT status FROM coach_clients WHERE id = $1', [request.request.id]);
  assert.equal(stillOpen.rows[0].status, 'requested');

  // Each of the three missing pieces alone is enough to refuse.
  await pool.query(`INSERT INTO coach_subscriptions (coach_id, startup_fee_paid_at, identity_verified) VALUES ($1, now(), false)`, [unready.id]);
  await pool.query(`UPDATE coach_profiles SET price_cents = 3000 WHERE user_id = $1`, [unready.id]);
  assert.equal((await kit.call(unready, 'POST', `/coach/requests/${request.request.id}/accept`)).status, 409);

  const ready = await kit.makeCoach('cb-ready', { ready: true });
  const s2 = await kit.register('cb-ready-student');
  const linkId = await kit.acceptedLink(ready, s2);
  const row = await pool.query('SELECT status FROM coach_clients WHERE id = $1', [linkId]);
  assert.equal(row.rows[0].status, 'pending_payment');
  // The student sees who and how much; the coach cannot be paid yet.
  const mine = await (await kit.call(s2, 'GET', '/coach/mine')).json();
  assert.equal(mine.pendingPayment.priceCents, 3000);
  assert.equal(mine.pendingPayment.coach.id, ready.id);
  assert.equal(mine.coach, null);
  assert.equal((await pool.query('SELECT plan_tier FROM users WHERE id = $1', [s2.id])).rows[0].plan_tier, 'free');
});

test('coach-checkout charges the coach\'s saved price on the coach\'s own account, for that student only', async () => {
  useFake();
  const coach = await kit.makeCoach('cb-checkout', { ready: true, priceCents: 4500, accountId: 'biz_checkout' });
  const student = await kit.register('cb-checkout-student');
  const stranger = await kit.register('cb-checkout-stranger');
  const linkId = await kit.acceptedLink(coach, student);

  // The price in the request is ignored; there is no such field.
  const res = await kit.call(student, 'POST', '/billing/coach-checkout', { coachId: coach.id, priceCents: 100 });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.checkoutUrl);
  const args = fake.calls.find((c) => c.method === 'createCheckout').args;
  assert.equal(args.kind, 'coach_student');
  assert.equal(args.amountCents, 4500);
  assert.equal(args.providerAccountId, 'biz_checkout');
  assert.equal(args.userId, student.id);
  assert.equal(args.coachUserId, coach.id);

  // The same link and price always send the same key (pressing pay twice can't open two).
  assert.equal(args.idempotencyKey, `coach-checkout-${linkId}-4500`);
  await kit.call(student, 'POST', '/billing/coach-checkout', { coachId: coach.id });
  const keys = fake.calls.filter((c) => c.method === 'createCheckout').map((c) => c.args.idempotencyKey);
  assert.deepEqual([...new Set(keys)], [`coach-checkout-${linkId}-4500`]);

  // Already holding a live subscription for this link: a second checkout is refused.
  await pool.query(
    `INSERT INTO student_subscriptions (user_id, coach_client_id, kind, interval, price_cents, status, provider_subscription_id)
     VALUES ($1, $2, 'coach', 'month', 4500, 'active', $3)`,
    [student.id, linkId, `mem_dup_${kit.run}`]
  );
  const second = await kit.call(student, 'POST', '/billing/coach-checkout', { coachId: coach.id });
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error.code, 'ALREADY_SUBSCRIBED');

  // Somebody the coach never accepted cannot open it.
  assert.equal((await kit.call(stranger, 'POST', '/billing/coach-checkout', { coachId: coach.id })).status, 404);
  assert.equal((await kit.call(student, 'POST', '/billing/coach-checkout', { coachId: 'nope' })).status, 400);
});

test('a failing payment company gives a friendly 502 and never a 500', async () => {
  useFake({ failOn: 'createCheckout' });
  const student = await kit.register('cb-502');
  const res = await kit.call(student, 'POST', '/billing/ai-checkout', { interval: 'month' });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error.code, 'CHECKOUT_UNAVAILABLE');
});

test('earnings and payouts show only the signed-in coach\'s own money', async () => {
  const a = await kit.makeCoach('cb-earn-a', { ready: true });
  const b = await kit.makeCoach('cb-earn-b', { ready: true });
  const student = await kit.register('cb-earn-student');
  await addPayment(a.id, student.id, { gross: 3000 });
  await addPayment(a.id, student.id, { gross: 3000 });
  await addPayment(b.id, student.id, { gross: 10000 });

  const earnA = await (await kit.call(a, 'GET', '/coach/earnings')).json();
  assert.equal(earnA.allTimeCents, 5100);
  assert.equal(earnA.owedCents, 5100);
  assert.equal(earnA.thisMonthCents, 5100);
  assert.equal(earnA.studentsThisMonth, 1);
  assert.equal(earnA.settledBy, 'cut');
  const earnB = await (await kit.call(b, 'GET', '/coach/earnings')).json();
  assert.equal(earnB.allTimeCents, 8500);

  await pool.query(`INSERT INTO payouts (coach_id, amount_cents, status) VALUES ($1, 700, 'paid')`, [b.id]);
  const payA = await (await kit.call(a, 'GET', '/coach/payouts')).json();
  assert.deepEqual(payA.payouts, []);
  assert.equal(payA.hasMore, false);
  const payB = await (await kit.call(b, 'GET', '/coach/payouts')).json();
  assert.equal(payB.payouts.length, 1);
  assert.equal(payB.payouts[0].amountCents, 700);
  assert.deepEqual(Object.keys(payB.payouts[0]).sort(), ['amountCents', 'createdAt', 'id', 'status']);
});

test('admin earnings list: owner only, revoked coaches included, negative balances flagged', async () => {
  const owed = await kit.makeCoach('cb-adm-owed', { ready: true });
  const revoked = await kit.makeCoach('cb-adm-revoked', { ready: true });
  const negative = await kit.makeCoach('cb-adm-neg', { ready: true });
  const student = await kit.register('cb-adm-student');
  await addPayment(owed.id, student.id, { gross: 3000 });
  await addPayment(revoked.id, student.id, { gross: 3000 });
  await pool.query(
    `INSERT INTO commission_ledger (coach_id, student_id, gross_cents, commission_cents, coach_cents, rate_bps, source_ref, kind, settled_by)
     VALUES ($1, $2, -3000, -450, -2550, 1500, $3, 'refund', 'cut')`,
    [negative.id, student.id, `refund:neg_${kit.run}`]
  );
  const revokeRes = await kit.call(admin, 'POST', `/admin/coaches/${revoked.id}/revoke`);
  assert.equal(revokeRes.status, 200);

  // A coach, and a student, get a plain 404 (nothing hints the page exists).
  assert.equal((await kit.call(owed, 'GET', '/admin/coaches/earnings')).status, 404);
  assert.equal((await kit.call(student, 'GET', '/admin/payouts')).status, 404);
  assert.equal((await kit.call(null, 'GET', '/admin/coaches/earnings')).status, 401);

  const body = await (await kit.call(admin, 'GET', '/admin/coaches/earnings')).json();
  const find = (id) => body.coaches.find((c) => c.userId === id);
  assert.equal(find(owed.id).owedCents, 2550);
  assert.equal(find(owed.id).revoked, false);
  assert.equal(find(revoked.id).revoked, true);
  assert.equal(find(revoked.id).owedCents, 2550);
  assert.equal(find(negative.id).owedCents, -2550);
  assert.ok(body.negativeBalances.some((n) => n.userId === negative.id && n.owedCents === -2550));
  assert.ok(!body.negativeBalances.some((n) => n.userId === owed.id));
  assert.ok(body.totalOwedCents >= 5100);

  // The revoked coach can still read their own owed money.
  const own = await kit.call(revoked, 'GET', '/coach/earnings');
  assert.equal(own.status, 200);
  assert.equal((await own.json()).owedCents, 2550);
  assert.equal((await kit.call(revoked, 'GET', '/coach/billing')).status, 200);
});

test('revoking a coach stops their students\' renewals', async () => {
  useFake();
  const coach = await kit.makeCoach('cb-stop', { ready: true });
  const student = await kit.register('cb-stop-student');
  const linkId = await kit.acceptedLink(coach, student);
  await pool.query(`UPDATE coach_clients SET status = 'active' WHERE id = $1`, [linkId]);
  await pool.query(
    `INSERT INTO student_subscriptions (user_id, coach_client_id, kind, interval, price_cents, provider_subscription_id)
     VALUES ($1, $2, 'coach', 'month', 3000, $3)`,
    [student.id, linkId, `mem_stop_${kit.run}`]
  );
  await kit.call(admin, 'POST', `/admin/coaches/${coach.id}/revoke`);
  assert.ok(fake.calls.some((c) => c.method === 'cancelSubscription' && c.args.providerSubscriptionId === `mem_stop_${kit.run}`));
  const sub = await pool.query('SELECT cancel_at_period_end FROM student_subscriptions WHERE coach_client_id = $1', [linkId]);
  assert.equal(sub.rows[0].cancel_at_period_end, true);
});

test('pay now pays each eligible coach once, with the payout id as the key; a second click pays nothing', async () => {
  useFake();
  const paid = await kit.makeCoach('cb-pay-ok', { ready: true });
  const unverified = await kit.makeCoach('cb-pay-unverified', { ready: true });
  const debt = await kit.makeCoach('cb-pay-debt', { ready: true });
  const revoked = await kit.makeCoach('cb-pay-revoked', { ready: true });
  const student = await kit.register('cb-pay-student');
  await addPayment(paid.id, student.id, { gross: 3000 });
  await addPayment(unverified.id, student.id, { gross: 3000 });
  await pool.query(`UPDATE coach_subscriptions SET identity_verified = false WHERE coach_id = $1`, [unverified.id]);
  await addPayment(debt.id, student.id, { gross: 3000 });
  await pool.query(
    `INSERT INTO commission_ledger (coach_id, student_id, gross_cents, commission_cents, coach_cents, rate_bps, source_ref, kind, settled_by)
     VALUES ($1, $2, -6000, -900, -5100, 1500, $3, 'refund', 'cut')`,
    [debt.id, student.id, `refund:debt_${kit.run}`]
  );
  await addPayment(revoked.id, student.id, { gross: 3000 });
  await kit.call(admin, 'POST', `/admin/coaches/${revoked.id}/revoke`);

  // Non-admins: 404 and nothing sent.
  assert.equal((await kit.call(paid, 'POST', '/admin/payouts/run')).status, 404);
  assert.equal(fake.calls.filter((c) => c.method === 'transferToCoach').length, 0);

  // Two clicks at the same moment.
  const [r1, r2] = await Promise.all([
    kit.call(admin, 'POST', '/admin/payouts/run'),
    kit.call(admin, 'POST', '/admin/payouts/run'),
  ]);
  assert.ok([r1.status, r2.status].every((s) => s === 200 || s === 409));
  assert.ok([r1.status, r2.status].includes(200));
  // And one more afterwards.
  assert.equal((await kit.call(admin, 'POST', '/admin/payouts/run')).status, 200);

  const transfers = fake.calls.filter((c) => c.method === 'transferToCoach');
  const accountOf = async (id) => (await pool.query('SELECT provider_account_id FROM coach_subscriptions WHERE coach_id = $1', [id])).rows[0].provider_account_id;
  const forAccount = async (id) => transfers.filter((t) => t.args.providerAccountId === accountId_[id]);
  const accountId_ = {
    [paid.id]: await accountOf(paid.id),
    [unverified.id]: await accountOf(unverified.id),
    [debt.id]: await accountOf(debt.id),
    [revoked.id]: await accountOf(revoked.id),
  };

  const okTransfers = await forAccount(paid.id);
  assert.equal(okTransfers.length, 1, 'paid exactly once');
  assert.equal(okTransfers[0].args.amountCents, 2550);
  const payoutRows = (await pool.query('SELECT * FROM payouts WHERE coach_id = $1', [paid.id])).rows;
  assert.equal(payoutRows.length, 1);
  assert.equal(payoutRows[0].status, 'paid');
  assert.equal(okTransfers[0].args.idempotencyKey, payoutRows[0].id);
  // The ledger row is claimed by that payout, so nothing is owed any more.
  assert.equal((await (await kit.call(paid, 'GET', '/coach/earnings')).json()).owedCents, 0);

  // Not verified: skipped, still owed. Negative balance: skipped. Revoked: paid.
  assert.equal((await forAccount(unverified.id)).length, 0);
  assert.equal((await (await kit.call(unverified, 'GET', '/coach/earnings')).json()).owedCents, 2550);
  assert.equal((await forAccount(debt.id)).length, 0);
  assert.equal((await (await kit.call(debt, 'GET', '/coach/earnings')).json()).owedCents, -2550);
  assert.equal((await forAccount(revoked.id)).length, 1);

  // The coach and the owner both see the payout; one coach never sees another's.
  const mine = await (await kit.call(paid, 'GET', '/coach/payouts')).json();
  assert.equal(mine.payouts.length, 1);
  assert.equal(mine.payouts[0].status, 'paid');
  const list = await (await kit.call(admin, 'GET', '/admin/payouts?limit=100')).json();
  const entry = list.payouts.find((p) => p.id === payoutRows[0].id);
  assert.equal(entry.coach.userId, paid.id);
  assert.equal(entry.amountCents, 2550);
  assert.ok(entry.providerRef);
});

test('a transfer that may or may not have gone through stays pending and is never re-sent with a new key', async () => {
  const { BillingError } = await import('../lib/billing/index.js');
  const unknown = new BillingError('timed out', { outcomeUnknown: true });
  useFake({ failOn: { transferToCoach: unknown } });
  const coach = await kit.makeCoach('cb-unknown', { ready: true });
  const student = await kit.register('cb-unknown-student');
  await addPayment(coach.id, student.id, { gross: 3000 });

  const run = await kit.call(admin, 'POST', '/admin/payouts/run');
  assert.equal(run.status, 200);
  const rows = (await pool.query('SELECT id, status FROM payouts WHERE coach_id = $1', [coach.id])).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'pending');
  // Still counted as taken: it is not owed a second time.
  assert.equal((await (await kit.call(coach, 'GET', '/coach/earnings')).json()).owedCents, 0);
  // Another run only retries the SAME payout (same key), never a new one.
  await kit.call(admin, 'POST', '/admin/payouts/run');
  assert.equal((await pool.query('SELECT 1 FROM payouts WHERE coach_id = $1', [coach.id])).rowCount, 1);
  const account = (await pool.query('SELECT provider_account_id FROM coach_subscriptions WHERE coach_id = $1', [coach.id])).rows[0].provider_account_id;
  const keys = new Set(fake.calls.filter((c) => c.method === 'transferToCoach' && c.args.providerAccountId === account).map((c) => c.args.idempotencyKey));
  assert.deepEqual([...keys], [rows[0].id]);
});

test('a definite refusal frees the money so the coach is owed it again', async () => {
  const { BillingError } = await import('../lib/billing/index.js');
  useFake({ failOn: { transferToCoach: new BillingError('refused', { status: 400, outcomeUnknown: false }) } });
  const coach = await kit.makeCoach('cb-refused', { ready: true });
  const student = await kit.register('cb-refused-student');
  await addPayment(coach.id, student.id, { gross: 3000 });
  const run = await (await kit.call(admin, 'POST', '/admin/payouts/run')).json();
  assert.ok(run.failed >= 1);
  const rows = (await pool.query('SELECT status FROM payouts WHERE coach_id = $1', [coach.id])).rows;
  assert.equal(rows[0].status, 'failed');
  assert.equal((await (await kit.call(coach, 'GET', '/coach/earnings')).json()).owedCents, 2550);
});

test('a 409 ("still working on that key") never frees the money; the retry reuses the same payout id and can then succeed', async () => {
  const { BillingError } = await import('../lib/billing/index.js');
  const busy = new BillingError('still working', { status: 409, outcomeUnknown: true });
  useFake({ failOn: { transferToCoach: busy } });
  const coach = await kit.makeCoach('cb-409', { ready: true });
  const student = await kit.register('cb-409-student');
  await addPayment(coach.id, student.id, { gross: 3000 });

  await kit.call(admin, 'POST', '/admin/payouts/run');
  await kit.call(admin, 'POST', '/admin/payouts/run');
  const rows = (await pool.query('SELECT id, status FROM payouts WHERE coach_id = $1', [coach.id])).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'pending');
  // The ledger row stays claimed by that same payout: not re-claimed under a new one.
  const claimed = (await pool.query('SELECT payout_id FROM commission_ledger WHERE coach_id = $1', [coach.id])).rows;
  assert.deepEqual(claimed.map((r) => r.payout_id), [rows[0].id]);
  assert.equal((await (await kit.call(coach, 'GET', '/coach/earnings')).json()).owedCents, 0);

  // The payment company is reachable again: the SAME payout is retried with the SAME key and settles.
  useFake({});
  await kit.call(admin, 'POST', '/admin/payouts/run');
  const after = (await pool.query('SELECT id, status FROM payouts WHERE coach_id = $1', [coach.id])).rows;
  assert.equal(after.length, 1);
  assert.equal(after[0].status, 'paid');
  const keys = fake.calls.filter((c) => c.method === 'transferToCoach').map((c) => c.args.idempotencyKey);
  assert.ok(keys.includes(rows[0].id));
});
