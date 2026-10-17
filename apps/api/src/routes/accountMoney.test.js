// Deleting an account when money is involved: payout and earnings history is
// kept (detached from the deleted coach), unpaid earnings block the deletion,
// and subscriptions are cancelled at the payment company first.
// The payment company is a fake; nothing touches a network.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { moneyOn, startKit, createFakeBillingClient } from './moneyTestKit.js';

moneyOn({ method: 'B' });

let kit;
let pool;
let setBillingClient;
let fake;

before(async () => {
  const { app } = await import('../app.js');
  ({ pool } = await import('../db/pool.js'));
  ({ setBillingClient } = await import('../lib/billing/index.js'));
  kit = startKit(app, pool);
  kit.start();
  fake = createFakeBillingClient();
  setBillingClient(fake);
});

after(async () => {
  setBillingClient(null);
  await kit.stop();
});

const deleteAccount = (who) => kit.call(who, 'DELETE', '/account', { password: 'hunter2pass' });

const paymentFields = (coach, student, linkId) => ({
  id: `pay_${kit.run}_${Math.random().toString(36).slice(2, 9)}`,
  total: 30,
  membership_id: `mem_${kit.run}_${Math.random().toString(36).slice(2, 9)}`,
  user_id: 'user_cust1',
  metadata: { userId: student.id, kind: 'coach_student', coachUserId: coach.id, linkId, interval: 'month' },
});

test('a coach with settled payout history can delete; the money records stay, detached', async () => {
  const coach = await kit.makeCoach('am-hist', { ready: true });
  const student = await kit.register('am-hist-stu');
  const { rows: payout } = await pool.query(
    `INSERT INTO payouts (coach_id, amount_cents, status) VALUES ($1, 2550, 'paid') RETURNING id`,
    [coach.id]
  );
  const ref = `payment:am_hist_${kit.run}`;
  await pool.query(
    `INSERT INTO commission_ledger (coach_id, student_id, gross_cents, commission_cents, coach_cents, rate_bps, source_ref, kind, settled_by, payout_id)
     VALUES ($1, $2, 3000, 450, 2550, 1500, $3, 'payment', 'cut', $4)`,
    [coach.id, student.id, ref, payout[0].id]
  );

  assert.equal((await deleteAccount(coach)).status, 204);

  const gone = await pool.query('SELECT 1 FROM users WHERE id = $1', [coach.id]);
  assert.equal(gone.rowCount, 0);
  const ledger = await pool.query('SELECT coach_id, coach_cents FROM commission_ledger WHERE source_ref = $1', [ref]);
  assert.equal(ledger.rowCount, 1, 'the earnings row is kept');
  assert.equal(ledger.rows[0].coach_id, null);
  const kept = await pool.query('SELECT coach_id FROM payouts WHERE id = $1', [payout[0].id]);
  assert.equal(kept.rowCount, 1, 'the payout row is kept');
  assert.equal(kept.rows[0].coach_id, null);
});

test('a coach who is still owed money cannot delete yet, and nothing is removed', async () => {
  const coach = await kit.makeCoach('am-owed', { ready: true });
  const student = await kit.register('am-owed-stu');
  await pool.query(
    `INSERT INTO commission_ledger (coach_id, student_id, gross_cents, commission_cents, coach_cents, rate_bps, source_ref, kind, settled_by)
     VALUES ($1, $2, 3000, 450, 2550, 1500, $3, 'payment', 'cut')`,
    [coach.id, student.id, `payment:am_owed_${kit.run}`]
  );
  const res = await deleteAccount(coach);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, 'PAYOUT_PENDING');
  assert.equal((await pool.query('SELECT 1 FROM users WHERE id = $1', [coach.id])).rowCount, 1);
});

test('deleting a paying student cancels their subscription at the payment company first', async () => {
  fake = createFakeBillingClient();
  setBillingClient(fake);
  const coach = await kit.makeCoach('am-sub', { ready: true });
  const student = await kit.register('am-sub-stu');
  const linkId = await kit.acceptedLink(coach, student);
  const pay = paymentFields(coach, student, linkId);
  assert.equal((await kit.webhook('payment.succeeded', pay)).status, 200);

  assert.equal((await deleteAccount(student)).status, 204);

  const cancels = fake.calls.filter((c) => c.method === 'cancelSubscription');
  assert.ok(
    cancels.some((c) => JSON.stringify(c).includes(pay.membership_id)),
    'the payment company was told to stop the subscription'
  );
});

test('deleting a coach also stops their students\' subscriptions', async () => {
  fake = createFakeBillingClient();
  setBillingClient(fake);
  const coach = await kit.makeCoach('am-coachsub', { ready: true });
  const student = await kit.register('am-coachsub-stu');
  const linkId = await kit.acceptedLink(coach, student);
  const pay = paymentFields(coach, student, linkId);
  assert.equal((await kit.webhook('payment.succeeded', pay)).status, 200);
  // The coach's earnings from this payment are still waiting, so settle them
  // the way a finished payout would, then delete.
  await pool.query("UPDATE commission_ledger SET settled_by = 'provider' WHERE coach_id = $1", [coach.id]);

  assert.equal((await deleteAccount(coach)).status, 204);

  const cancels = fake.calls.filter((c) => c.method === 'cancelSubscription');
  assert.ok(cancels.some((c) => JSON.stringify(c).includes(pay.membership_id)));
});

test('login ignores spaces around the email address', async () => {
  const user = await kit.register('am-trim');
  const res = await fetch(`${kit.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `  ${user.email.toUpperCase()}  `, password: 'hunter2pass' }),
  });
  assert.equal(res.status, 200);
});

// ---- Coaches who owe Cut money (debt holds) ----

const registerEmail = (email) =>
  fetch(`${kit.baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Again User' }),
  });

// A coach whose unpaid balance is net negative: an earlier payout was paid,
// then a refund came in after it (settled_by 'cut', not yet paid out).
async function makeOwingCoach(label) {
  const coach = await kit.makeCoach(label, { ready: true });
  const student = await kit.register(`${label}-stu`);
  const { rows: payout } = await pool.query(
    `INSERT INTO payouts (coach_id, amount_cents, status) VALUES ($1, 2550, 'paid') RETURNING id`,
    [coach.id]
  );
  await pool.query(
    `INSERT INTO commission_ledger (coach_id, student_id, gross_cents, commission_cents, coach_cents, rate_bps, source_ref, kind, settled_by, payout_id)
     VALUES ($1, $2, 3000, 450, 2550, 1500, $3, 'payment', 'cut', $4)`,
    [coach.id, student.id, `payment:${label}_${kit.run}`, payout[0].id]
  );
  const { rows: refund } = await pool.query(
    `INSERT INTO commission_ledger (coach_id, student_id, gross_cents, commission_cents, coach_cents, rate_bps, source_ref, kind, original_ref, settled_by)
     VALUES ($1, $2, -3000, -450, -2550, 1500, $3, 'refund', $4, 'cut') RETURNING id`,
    [coach.id, student.id, `refund:${label}_${kit.run}`, `payment:${label}_${kit.run}`]
  );
  return { coach, refundId: refund[0].id };
}

const holdsFor = async (cents, ledgerId) =>
  (await pool.query('SELECT * FROM coach_debt_holds WHERE $1 = ANY(ledger_ids) AND amount_cents = $2', [ledgerId, cents])).rows;

test('a coach who owes Cut can delete; a hold is recorded with no raw email, and the money rows stay', async () => {
  const { coach, refundId } = await makeOwingCoach('am-debt');
  assert.equal((await deleteAccount(coach)).status, 204);
  assert.equal((await pool.query('SELECT 1 FROM users WHERE id = $1', [coach.id])).rowCount, 0);
  const holds = await holdsFor(2550, refundId);
  assert.equal(holds.length, 1);
  assert.equal(holds[0].settled_at, null);
  assert.ok(!JSON.stringify(holds[0]).includes(coach.email), 'the email itself is not stored');
  const ledger = await pool.query('SELECT coach_id FROM commission_ledger WHERE id = $1', [refundId]);
  assert.equal(ledger.rows[0].coach_id, null, 'ledger row kept, detached');
});

test('the same email (any case or spaces) cannot register while the hold is open; settling frees it', async () => {
  const { coach, refundId } = await makeOwingCoach('am-hold');
  assert.equal((await deleteAccount(coach)).status, 204);

  for (const variant of [coach.email, `  ${coach.email.toUpperCase()} `]) {
    const res = await registerEmail(variant);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'ACCOUNT_ON_HOLD');
    assert.match(body.error.message, /unpaid balance/);
  }
  // Other emails are unaffected.
  assert.equal((await registerEmail(`money-other-${kit.run}@example.com`)).status, 201);

  // Only the admin can settle; a normal user just sees "not found".
  const hold = (await holdsFor(2550, refundId))[0];
  const plain = await kit.register('am-hold-plain');
  assert.equal((await kit.call(plain, 'POST', `/admin/debt-holds/${hold.id}/settle`)).status, 404);
  const admin = await kit.makeAdmin('am-hold-admin');
  const list = await (await kit.call(admin, 'GET', '/admin/debt-holds')).json();
  assert.ok(list.holds.some((h) => h.id === hold.id && h.settledAt === null));
  assert.equal((await kit.call(admin, 'POST', `/admin/debt-holds/${hold.id}/settle`)).status, 200);
  assert.equal((await kit.call(admin, 'POST', `/admin/debt-holds/${hold.id}/settle`)).status, 404, 'already settled');

  assert.equal((await registerEmail(coach.email)).status, 201);
});

test('a coach with a zero balance deletes with no hold', async () => {
  const before = (await pool.query('SELECT COUNT(*)::int AS n FROM coach_debt_holds')).rows[0].n;
  const coach = await kit.makeCoach('am-clean', { ready: true });
  assert.equal((await deleteAccount(coach)).status, 204);
  const after = (await pool.query('SELECT COUNT(*)::int AS n FROM coach_debt_holds')).rows[0].n;
  assert.equal(after, before);
});
