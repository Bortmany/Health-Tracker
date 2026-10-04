// Money safety fixes (migration 028): stuck payouts never release money on a bad
// reply, switching coach waits for the new payment, failed cancels and refunds
// are saved and retried, unusable payments are refunded instead of credited,
// and disputes take the coach's share back (and give it back when won).
// The payment company is a fake; nothing touches a network.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { moneyOn, startKit, createFakeBillingClient, buildFakeEvent } from './moneyTestKit.js';

moneyOn({ method: 'B' });

let kit;
let pool;
let setBillingClient;
let BillingError;
let admin;
let fake;

before(async () => {
  const { app } = await import('../app.js');
  ({ pool } = await import('../db/pool.js'));
  ({ setBillingClient, BillingError } = await import('../lib/billing/index.js'));
  kit = startKit(app, pool);
  kit.start();
  admin = await kit.makeAdmin('ms-admin');
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

const unknownError = () => new BillingError('timed out', { outcomeUnknown: true });
const busyError = () => new BillingError('still working', { status: 409, outcomeUnknown: true });

const ledgerFor = async (coachId) =>
  (await pool.query('SELECT * FROM commission_ledger WHERE coach_id = $1 ORDER BY created_at, id', [coachId])).rows;
const coachTotal = async (coachId) => (await ledgerFor(coachId)).reduce((sum, r) => sum + r.coach_cents, 0);
const linkOf = async (id) => (await pool.query('SELECT * FROM coach_clients WHERE id = $1', [id])).rows[0];
const subOf = async (providerId) =>
  (await pool.query('SELECT * FROM student_subscriptions WHERE provider_subscription_id = $1', [providerId])).rows[0];
const payoutsOf = async (coachId) =>
  (await pool.query('SELECT * FROM payouts WHERE coach_id = $1 ORDER BY created_at', [coachId])).rows;
const callsOf = (name) => fake.calls.filter((c) => c.method === name);
const attention = async () => (await (await kit.call(admin, 'GET', '/admin/coaches/earnings')).json()).needsAttention;
const runPay = () => kit.call(admin, 'POST', '/admin/payouts/run');

// One coach with a paid-in $30 coaching payment owed (25.50 to the coach).
async function coachWithOwedMoney(label) {
  const coach = await kit.makeCoach(label, { ready: true });
  const student = await kit.register(`${label}-student`);
  await pool.query(
    `INSERT INTO commission_ledger (coach_id, student_id, gross_cents, commission_cents, coach_cents, rate_bps, source_ref, kind, settled_by)
     VALUES ($1, $2, 3000, 450, 2550, 1500, $3, 'payment', 'cut')`,
    [coach.id, student.id, `payment:ms_${label}_${kit.run}`]
  );
  return coach;
}

// A payout that is already pending (as if an earlier run had timed out), with
// the coach's owed money claimed by it. `account` is what it was first sent to.
async function pendingPayout(coach, { ageMinutes = 30, reference = null, account = null } = {}) {
  const accountId =
    account ?? (await pool.query('SELECT provider_account_id FROM coach_subscriptions WHERE coach_id = $1', [coach.id])).rows[0].provider_account_id;
  const { rows } = await pool.query(
    `INSERT INTO payouts (coach_id, amount_cents, status, provider_account_id, idempotency_key, provider_reference, created_at)
     VALUES ($1, 2550, 'pending', $2, 'placeholder', $3, now() - ($4::int * interval '1 minute'))
     RETURNING id`,
    [coach.id, accountId, reference, ageMinutes]
  );
  const id = rows[0].id;
  await pool.query(`UPDATE payouts SET idempotency_key = id::text WHERE id = $1`, [id]);
  await pool.query(`UPDATE commission_ledger SET payout_id = $1 WHERE coach_id = $2 AND payout_id IS NULL`, [id, coach.id]);
  return { id, accountId };
}

/* ------------------------------ 1. payouts ------------------------------ */

test('a timeout and then a duplicate-error reply keep the money held, with no second payout', async () => {
  useFake({ failOn: { transferToCoach: unknownError() } });
  const coach = await coachWithOwedMoney('ms-dup');
  await runPay();
  let rows = await payoutsOf(coach.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].attention, 'unconfirmed_reply');

  // The retry gets "still working on that key" (409): still nothing released.
  useFake({ failOn: { transferToCoach: busyError() } });
  await runPay();
  await runPay();
  rows = await payoutsOf(coach.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'pending');
  const held = (await ledgerFor(coach.id)).map((r) => r.payout_id);
  assert.deepEqual(held, [rows[0].id]);
  // The owner is told, in plain words.
  const note = (await attention()).find((n) => n.id === rows[0].id);
  assert.match(note.message, /unclear reply/);
});

test('the payment company explicitly saying "failed" releases the money exactly once', async () => {
  const coach = await coachWithOwedMoney('ms-failed');
  const original = await pendingPayout(coach, { reference: 'wdrl_known1' });
  // Status check says failed; the fresh payout that follows keeps timing out so it stays pending.
  useFake({ transferStatus: 'failed', failOn: { transferToCoach: unknownError() } });
  await runPay();
  await runPay();
  const rows = await payoutsOf(coach.id);
  assert.equal(rows.filter((r) => r.status === 'failed').length, 1);
  assert.equal(rows.find((r) => r.id === original.id).status, 'failed');
  const pending = rows.filter((r) => r.status === 'pending');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].amount_cents, 2550, 'the same owed amount, owed once');
  assert.equal(callsOf('getPayoutStatus').filter((c) => c.args.providerReference === 'wdrl_known1').length >= 1, true);
});

test('a lookup that finds the transfer marks the payout paid, and nothing is sent again', async () => {
  const coach = await coachWithOwedMoney('ms-found');
  const payout = await pendingPayout(coach, { ageMinutes: 60 });
  useFake();
  fake.plantTransfer(payout.id, 'paid');
  await runPay();
  const rows = await payoutsOf(coach.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'paid');
  assert.ok(rows[0].provider_reference);
  assert.equal(callsOf('transferToCoach').filter((c) => c.args.idempotencyKey === payout.id).length, 0);
});

test('a lookup that finds nothing releases the money once; it is then paid under a new payout', async () => {
  const coach = await coachWithOwedMoney('ms-notfound');
  const payout = await pendingPayout(coach, { ageMinutes: 60 });
  useFake();
  await runPay();
  await runPay();
  const rows = await payoutsOf(coach.id);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.id === payout.id).status, 'failed');
  const fresh = rows.find((r) => r.id !== payout.id);
  assert.equal(fresh.status, 'paid');
  assert.equal(fresh.amount_cents, 2550);
  assert.equal(callsOf('transferToCoach').filter((c) => c.args.providerAccountId === payout.accountId).length, 1, 'paid once in total');
});

test('a lookup that ERRORS is not "not found": the money stays held and the owner is told', async () => {
  const coach = await coachWithOwedMoney('ms-lookuperr');
  const payout = await pendingPayout(coach, { ageMinutes: 60 });
  useFake({ failOn: ['findTransferByKey'] });
  await runPay();
  const rows = await payoutsOf(coach.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].attention, 'lookup_failed');
  assert.equal(callsOf('transferToCoach').filter((c) => c.args.idempotencyKey === payout.id).length, 0);
  assert.equal((await ledgerFor(coach.id))[0].payout_id, payout.id);
  assert.match((await attention()).find((n) => n.id === payout.id).message, /could not check/);
});

const sentTo = (accountId) => callsOf('transferToCoach').filter((c) => c.args.providerAccountId === accountId).length;

test('a keyless transfer to the same account within 24 hours (different amount and note) keeps the money held and flags the owner', async () => {
  const coach = await coachWithOwedMoney('ms-keyless-near');
  const payout = await pendingPayout(coach, { ageMinutes: 60 });
  useFake();
  fake.plantKeylessTransfer(payout.accountId, new Date(Date.now() - 30 * 60 * 1000));
  await runPay();
  await runPay();
  const rows = await payoutsOf(coach.id);
  assert.equal(rows.length, 1, 'no second payout');
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].attention, 'keyless_transfer_nearby');
  assert.equal(sentTo(payout.accountId), 0, 'nothing sent');
  assert.equal((await ledgerFor(coach.id))[0].payout_id, payout.id);
  assert.match((await attention()).find((n) => n.id === payout.id).message, /without our reference/);
});

test('a keyless transfer to a DIFFERENT account is ignored: the money is released once', async () => {
  const coach = await coachWithOwedMoney('ms-keyless-other');
  const payout = await pendingPayout(coach, { ageMinutes: 60 });
  useFake();
  fake.plantKeylessTransfer('biz_someone_else', new Date(Date.now() - 30 * 60 * 1000));
  await runPay();
  const rows = await payoutsOf(coach.id);
  assert.equal(rows.find((r) => r.id === payout.id).status, 'failed');
  assert.equal(sentTo(payout.accountId), 1);
});

test('a keyless transfer more than 24 hours before the payout is ignored', async () => {
  const coach = await coachWithOwedMoney('ms-keyless-old');
  const payout = await pendingPayout(coach, { ageMinutes: 60 });
  useFake();
  fake.plantKeylessTransfer(payout.accountId, new Date(Date.now() - 60 * 60 * 1000 - 25 * 60 * 60 * 1000));
  await runPay();
  const rows = await payoutsOf(coach.id);
  assert.equal(rows.find((r) => r.id === payout.id).status, 'failed');
  assert.equal(sentTo(payout.accountId), 1);
});

test('a truly empty list on a payout 10+ minutes old releases the money once; replaying never pays twice', async () => {
  const coach = await coachWithOwedMoney('ms-empty-replay');
  const payout = await pendingPayout(coach, { ageMinutes: 15 });
  useFake();
  await runPay();
  await runPay();
  await runPay();
  const rows = await payoutsOf(coach.id);
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((r) => r.status === 'paid').length, 1);
  assert.equal(sentTo(payout.accountId), 1, 'paid once in total');
});

test('a payout older than 3 days is looked up first; if nothing is found it goes to manual review, money held, nothing re-sent', async () => {
  const coach = await coachWithOwedMoney('ms-stale');
  const payout = await pendingPayout(coach, { ageMinutes: 4 * 24 * 60 });
  useFake();
  await runPay();
  await runPay();
  const rows = await payoutsOf(coach.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'manual_review');
  assert.equal(callsOf('transferToCoach').filter((c) => c.args.idempotencyKey === payout.id).length, 0, 'never sent again');
  assert.ok(callsOf('findTransferByKey').length >= 1, 'a read-only lookup was tried');
  assert.equal((await ledgerFor(coach.id))[0].payout_id, payout.id);
  const note = (await attention()).find((n) => n.id === payout.id);
  assert.match(note.message, /more than 3 days/);
  // It counts as neither owed nor paid: it is "being checked".
  const mine = await (await kit.call(coach, 'GET', '/coach/earnings')).json();
  assert.equal(mine.owedCents, 0);
  assert.equal(mine.paidCents, 0);
  assert.equal(mine.beingCheckedCents, 2550);
  const owner = (await (await kit.call(admin, 'GET', '/admin/coaches/earnings')).json()).coaches.find((c) => c.userId === coach.id);
  assert.equal(owner.paidCents, 0);
  assert.equal(owner.beingCheckedCents, 2550);
});

test('a payout older than 3 days whose transfer IS found is settled, not parked', async () => {
  const coach = await coachWithOwedMoney('ms-stale-found');
  const payout = await pendingPayout(coach, { ageMinutes: 5 * 24 * 60 });
  useFake();
  fake.plantTransfer(payout.id, 'paid');
  await runPay();
  const rows = await payoutsOf(coach.id);
  assert.equal(rows[0].status, 'paid');
  assert.equal(callsOf('transferToCoach').filter((c) => c.args.idempotencyKey === payout.id).length, 0);
  const mine = await (await kit.call(coach, 'GET', '/coach/earnings')).json();
  assert.equal(mine.paidCents, 2550);
  assert.equal(mine.beingCheckedCents, 0);
});

test('an old payout whose lookup ERRORS is parked, never released', async () => {
  const coach = await coachWithOwedMoney('ms-stale-err');
  const payout = await pendingPayout(coach, { ageMinutes: 5 * 24 * 60 });
  useFake({ failOn: ['findTransferByKey'] });
  await runPay();
  const rows = await payoutsOf(coach.id);
  assert.equal(rows[0].status, 'manual_review');
  assert.equal((await ledgerFor(coach.id))[0].payout_id, payout.id);
});

test('a parked payout is looked at again every run and settles when the transfer turns up', async () => {
  const paidCoach = await coachWithOwedMoney('ms-parked-paid');
  const paidPayout = await pendingPayout(paidCoach, { ageMinutes: 5 * 24 * 60 });
  const failedCoach = await coachWithOwedMoney('ms-parked-failed');
  const failedPayout = await pendingPayout(failedCoach, { ageMinutes: 5 * 24 * 60 });
  await pool.query(`UPDATE payouts SET status = 'manual_review' WHERE id = ANY($1::uuid[])`, [[paidPayout.id, failedPayout.id]]);

  // A lookup that errors changes nothing.
  useFake({ failOn: ['findTransferByKey'] });
  await runPay();
  assert.equal((await payoutsOf(paidCoach.id))[0].status, 'manual_review');

  useFake({ failOn: { transferToCoach: unknownError() } });
  fake.plantTransfer(paidPayout.id, 'paid');
  fake.plantTransfer(failedPayout.id, 'failed');
  await runPay();
  await runPay();
  assert.equal((await payoutsOf(paidCoach.id)).find((r) => r.id === paidPayout.id).status, 'paid');
  assert.equal((await payoutsOf(failedCoach.id)).find((r) => r.id === failedPayout.id).status, 'failed');
  assert.equal((await ledgerFor(paidCoach.id))[0].payout_id, paidPayout.id);
  assert.notEqual((await ledgerFor(failedCoach.id))[0].payout_id, failedPayout.id, 'released');
});

async function parkedPayout(label) {
  const coach = await coachWithOwedMoney(label);
  const payout = await pendingPayout(coach, { ageMinutes: 5 * 24 * 60 });
  await pool.query(`UPDATE payouts SET status = 'manual_review' WHERE id = $1`, [payout.id]);
  return { coach, payout };
}
const resolve = (id, body) => kit.call(admin, 'POST', `/admin/payouts/${id}/resolve`, body);

test('the owner can mark a parked payout NOT sent: money released exactly once, a repeat changes nothing', async () => {
  const { coach, payout } = await parkedPayout('ms-resolve-failed');
  assert.equal((await resolve(payout.id, { outcome: 'failed', note: 'Not in the transfers list' })).status, 200);
  let rows = await payoutsOf(coach.id);
  assert.equal(rows[0].status, 'failed');
  assert.equal(rows[0].resolution_note, 'Not in the transfers list');
  assert.equal((await ledgerFor(coach.id))[0].payout_id, null);
  // Pretend a later run already claimed the money again under a new payout.
  const { rows: fresh } = await pool.query(
    `INSERT INTO payouts (coach_id, amount_cents, status) VALUES ($1, 2550, 'pending') RETURNING id`, [coach.id]
  );
  await pool.query('UPDATE commission_ledger SET payout_id = $2 WHERE coach_id = $1', [coach.id, fresh[0].id]);
  const again = await resolve(payout.id, { outcome: 'failed', note: 'again' });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).changed, false);
  assert.equal((await ledgerFor(coach.id))[0].payout_id, fresh[0].id, 'the replay released nothing');
  assert.equal((await resolve(payout.id, { outcome: 'paid', note: 'wrong way' })).status, 409);
  rows = await payoutsOf(coach.id);
  assert.equal(rows.find((r) => r.id === payout.id).status, 'failed');
});

test('the owner can mark a parked payout as sent; money stays taken, and only parked payouts can be settled', async () => {
  const { coach, payout } = await parkedPayout('ms-resolve-paid');
  assert.equal((await resolve(payout.id, { outcome: 'paid', note: 'Seen in Whop' })).status, 200);
  assert.equal((await payoutsOf(coach.id))[0].status, 'paid');
  assert.equal((await ledgerFor(coach.id))[0].payout_id, payout.id);
  assert.equal((await resolve(payout.id, { outcome: 'failed', note: 'oops' })).status, 409);
  assert.equal((await ledgerFor(coach.id))[0].payout_id, payout.id);

  // A payout that is merely pending cannot be settled by hand.
  const other = await coachWithOwedMoney('ms-resolve-pending');
  const pending = await pendingPayout(other);
  assert.equal((await resolve(pending.id, { outcome: 'paid', note: 'no' })).status, 409);
  assert.equal((await payoutsOf(other.id))[0].status, 'pending');
});

test('settling a payout by hand checks its input and is owner-only', async () => {
  const { coach, payout } = await parkedPayout('ms-resolve-bad');
  assert.equal((await resolve(payout.id, { outcome: 'maybe', note: 'x' })).status, 400);
  assert.equal((await resolve(payout.id, { outcome: 'paid', note: '   ' })).status, 400);
  assert.equal((await resolve(payout.id, { outcome: 'paid', note: 'x'.repeat(301) })).status, 400);
  assert.equal((await resolve('not-a-uuid', { outcome: 'paid', note: 'x' })).status, 404);
  assert.equal((await kit.call(coach, 'POST', `/admin/payouts/${payout.id}/resolve`, { outcome: 'paid', note: 'x' })).status, 404);
  assert.equal((await payoutsOf(coach.id))[0].status, 'manual_review');
});

test('replaying the whole run twice never makes two payouts for the same owed amount', async () => {
  useFake({ failOn: { transferToCoach: unknownError() } });
  const coach = await coachWithOwedMoney('ms-replay');
  await runPay();
  await runPay();
  await runPay();
  const rows = await payoutsOf(coach.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount_cents, 2550);
});

test('a retry uses the ORIGINAL account and key even if the coach\'s account changed afterwards', async () => {
  useFake({ failOn: { transferToCoach: unknownError() } });
  const coach = await coachWithOwedMoney('ms-origacct');
  await runPay();
  const [payout] = await payoutsOf(coach.id);
  const original = payout.provider_account_id;
  assert.ok(original);
  await pool.query(`UPDATE coach_subscriptions SET provider_account_id = 'biz_changed_later' WHERE coach_id = $1`, [coach.id]);
  useFake();
  await runPay();
  const mine = fake.calls.filter((c) => c.args?.idempotencyKey === payout.id);
  assert.ok(mine.length >= 1);
  for (const call of mine) assert.equal(call.args.providerAccountId, original);
  assert.equal(fake.calls.some((c) => c.args?.providerAccountId === 'biz_changed_later' && c.args?.idempotencyKey === payout.id), false);
});

/* ------------------------- 2. switching coach -------------------------- */

const paymentFields = (coach, student, linkId, extra = {}) => ({
  id: `pay_${kit.run}_${Math.random().toString(36).slice(2, 9)}`,
  total: 30,
  membership_id: `mem_${kit.run}_${Math.random().toString(36).slice(2, 9)}`,
  user_id: 'user_cust1',
  metadata: { userId: student.id, kind: 'coach_student', coachUserId: coach.id, linkId, interval: 'month' },
  ...extra,
});

// A student with a PAID, active old coach and an email invite from a new coach.
async function switchSetup(label) {
  const oldCoach = await kit.makeCoach(`${label}-old`, { ready: true });
  const newCoach = await kit.makeCoach(`${label}-new`, { ready: true });
  const student = await kit.register(`${label}-stu`);
  const oldLink = await kit.acceptedLink(oldCoach, student);
  const oldPay = paymentFields(oldCoach, student, oldLink);
  assert.equal((await kit.webhook('payment.succeeded', oldPay)).status, 200);
  assert.equal((await linkOf(oldLink)).status, 'active');

  assert.equal((await kit.call(newCoach, 'POST', '/coach/invites/email', { email: student.email })).status, 202);
  const { coachInvites } = await (await kit.call(student, 'GET', '/coach-link')).json();
  const accept = await kit.call(student, 'POST', `/coach-link/invites/${coachInvites[0].id}/accept`, { replaceCurrent: true });
  assert.equal(accept.status, 200);
  return { oldCoach, newCoach, student, oldLink, newLink: coachInvites[0].id, oldPay };
}

test('switching coach: accepting changes nothing for the old coach; the new coach\'s payment ends it (once)', async () => {
  useFake();
  const s = await switchSetup('ms-switch');
  // Accepted but not paid: the old coach is untouched and nothing was cancelled.
  assert.equal((await linkOf(s.oldLink)).status, 'active');
  assert.equal((await linkOf(s.newLink)).status, 'pending_payment');
  assert.equal(callsOf('cancelSubscription').length, 0);
  assert.equal((await subOf(s.oldPay.membership_id)).cancel_at_period_end, false);

  // The new coach's payment arrives.
  const newPay = paymentFields(s.newCoach, s.student, s.newLink);
  const eventId = `msg_${kit.run}_switch_pay`;
  assert.equal((await kit.webhook('payment.succeeded', newPay, { id: eventId })).status, 200);
  assert.equal((await linkOf(s.newLink)).status, 'active');
  const old = await linkOf(s.oldLink);
  assert.equal(old.status, 'ended');
  assert.ok(old.ended_at);
  const oldSub = await subOf(s.oldPay.membership_id);
  assert.equal(oldSub.cancel_at_period_end, true);
  assert.equal(new Date(oldSub.current_period_end).toISOString(), '2030-01-31T00:00:00.000Z');
  assert.deepEqual(callsOf('cancelSubscription').map((c) => c.args.providerSubscriptionId), [s.oldPay.membership_id]);

  // Replays (same message, and the later "membership activated") change nothing.
  assert.equal((await kit.webhook('payment.succeeded', newPay, { id: eventId })).status, 200);
  await kit.webhook('membership.activated', { id: newPay.membership_id, metadata: newPay.metadata });
  assert.equal(callsOf('cancelSubscription').length, 1);
  assert.equal((await linkOf(s.newLink)).status, 'active');
  assert.equal((await ledgerFor(s.newCoach.id)).length, 1);
});

test('switching coach: a student who never pays the new coach keeps the old one', async () => {
  useFake();
  const s = await switchSetup('ms-nopay');
  await kit.call(s.student, 'DELETE', `/coach-link/requests/${s.newLink}`);
  assert.equal((await linkOf(s.oldLink)).status, 'active');
  assert.equal((await subOf(s.oldPay.membership_id)).cancel_at_period_end, false);
  assert.equal(callsOf('cancelSubscription').length, 0);
});

test('switching coach: if the old renewal cannot be stopped right now, the cancel is saved for retry', async () => {
  useFake({ failOn: ['cancelSubscription'] });
  const s = await switchSetup('ms-switchfail');
  const newPay = paymentFields(s.newCoach, s.student, s.newLink);
  assert.equal((await kit.webhook('payment.succeeded', newPay)).status, 200);
  assert.equal((await linkOf(s.newLink)).status, 'active');
  assert.equal((await linkOf(s.oldLink)).status, 'ended');
  assert.equal((await subOf(s.oldPay.membership_id)).cancel_at_period_end, false);
  const pending = await pool.query('SELECT * FROM pending_cancels WHERE provider_subscription_id = $1', [s.oldPay.membership_id]);
  assert.equal(pending.rowCount, 1);
});

/* ------------------------ 3. cancels that fail ------------------------- */

test('a failed cancel is saved once, retried until it works, and listed for the owner meanwhile', async () => {
  const { stopSubscriptionsWhere } = await import('../lib/stopSubscriptions.js');
  const { retryPendingCancels } = await import('../lib/providerRetries.js');
  const coach = await kit.makeCoach('ms-cancel', { ready: true });
  const student = await kit.register('ms-cancel-stu');
  const linkId = await kit.acceptedLink(coach, student);
  const pay = paymentFields(coach, student, linkId);
  useFake();
  await kit.webhook('payment.succeeded', pay);
  const pendingRows = () => pool.query('SELECT * FROM pending_cancels WHERE provider_subscription_id = $1', [pay.membership_id]);

  useFake({ failOn: ['cancelSubscription'] });
  await stopSubscriptionsWhere('cc.id = $1', [linkId]);
  await stopSubscriptionsWhere('cc.id = $1', [linkId]); // asked twice: still one saved row
  assert.equal((await pendingRows()).rowCount, 1);
  assert.equal((await subOf(pay.membership_id)).cancel_at_period_end, false);
  assert.ok((await attention()).some((n) => n.kind === 'cancel_pending'));

  // Still failing: stays saved and listed, not duplicated.
  await retryPendingCancels();
  assert.equal((await pendingRows()).rowCount, 1);
  assert.equal((await subOf(pay.membership_id)).cancel_at_period_end, false);

  // The owner's "Pay coaches now" retries it too; once it works the row is cleared.
  useFake();
  assert.equal((await runPay()).status, 200);
  assert.equal((await pendingRows()).rowCount, 0);
  assert.equal((await subOf(pay.membership_id)).cancel_at_period_end, true);
});

test('a student\'s next visit to their subscriptions retries only THEIR saved cancels', async () => {
  const coach = await kit.makeCoach('ms-visit', { ready: true });
  const mine = await kit.register('ms-visit-a');
  const other = await kit.register('ms-visit-b');
  const linkA = await kit.acceptedLink(coach, mine);
  const linkB = await kit.acceptedLink(coach, other);
  const payA = paymentFields(coach, mine, linkA);
  const payB = paymentFields(coach, other, linkB);
  useFake();
  await kit.webhook('payment.succeeded', payA);
  await kit.webhook('payment.succeeded', payB);
  const { stopSubscriptionsWhere } = await import('../lib/stopSubscriptions.js');
  useFake({ failOn: ['cancelSubscription'] });
  await stopSubscriptionsWhere('cc.id = ANY($1::uuid[])', [[linkA, linkB]]);

  useFake();
  assert.equal((await kit.call(mine, 'GET', '/billing/subscriptions')).status, 200);
  assert.equal((await subOf(payA.membership_id)).cancel_at_period_end, true);
  assert.equal((await subOf(payB.membership_id)).cancel_at_period_end, false, 'someone else\'s stays untouched');
  assert.deepEqual(callsOf('cancelSubscription').map((c) => c.args.providerSubscriptionId), [payA.membership_id]);
});

// Makes the fake's cancel call record whether the saved row already existed at
// the moment the call happened (it must: it is saved in the same step as the
// message, before the network call).
function watchSavedCancels() {
  const seen = {};
  const original = fake.cancelSubscription;
  fake.cancelSubscription = async (args) => {
    const { rowCount } = await pool.query('SELECT 1 FROM pending_cancels WHERE provider_subscription_id = $1', [args.providerSubscriptionId]);
    seen[args.providerSubscriptionId] = rowCount > 0;
    return original(args);
  };
  return seen;
}
const savedCancel = async (providerId) =>
  (await pool.query('SELECT 1 FROM pending_cancels WHERE provider_subscription_id = $1', [providerId])).rowCount;

test('a cancel is saved INSIDE the transaction (switching coach), run after, and cleared on success', async () => {
  useFake();
  const seen = watchSavedCancels();
  const s = await switchSetup('ms-savedswitch');
  assert.equal((await kit.webhook('payment.succeeded', paymentFields(s.newCoach, s.student, s.newLink))).status, 200);
  assert.equal(seen[s.oldPay.membership_id], true, 'saved before the call');
  assert.equal(await savedCancel(s.oldPay.membership_id), 0, 'cleared once it worked');
  assert.equal((await subOf(s.oldPay.membership_id)).cancel_at_period_end, true);
});

test('a cancel is saved for the duplicate-subscription case too', async () => {
  const coach = await kit.makeCoach('ms-saveddup', { ready: true });
  const student = await kit.register('ms-saveddup-stu');
  const link = await kit.acceptedLink(coach, student);
  useFake();
  const first = paymentFields(coach, student, link);
  await kit.webhook('payment.succeeded', first);
  const seen = watchSavedCancels();
  const extra = paymentFields(coach, student, link);
  await kit.webhook('payment.succeeded', extra);
  assert.equal(seen[extra.membership_id], true);
  assert.equal(await savedCancel(extra.membership_id), 0);
  assert.deepEqual(callsOf('refundPayment').map((c) => c.args.providerPaymentId), [extra.id]);

  // With the payment company down, the saved row is what remembers it.
  const extra2 = paymentFields(coach, student, link);
  useFake({ failOn: ['cancelSubscription'] });
  await kit.webhook('payment.succeeded', extra2);
  assert.equal(await savedCancel(extra2.membership_id), 1);
});

test('a cancel is saved in the blocked "already has a coach" case, tied to its subscription row', async () => {
  useFake();
  const s = await blockedSetup('ms-savedblocked');
  const seen = watchSavedCancels();
  const fields = paymentFields(s.second, s.student, s.secondLink);
  await kit.webhook('payment.succeeded', fields);
  assert.equal(seen[fields.membership_id], true);
  assert.equal(await savedCancel(fields.membership_id), 0);
  useFake({ failOn: ['cancelSubscription'] });
  const again = await blockedSetup('ms-savedblocked2');
  const f2 = paymentFields(again.second, again.student, again.secondLink);
  await kit.webhook('payment.succeeded', f2);
  const row = (await pool.query('SELECT subscription_id FROM pending_cancels WHERE provider_subscription_id = $1', [f2.membership_id])).rows[0];
  assert.equal(row.subscription_id, (await subOf(f2.membership_id)).id);
});

test('"ended" for a cancelled EXTRA subscription never ends the real one or the coach link', async () => {
  const coach = await kit.makeCoach('ms-endextra', { ready: true });
  const student = await kit.register('ms-endextra-stu');
  const link = await kit.acceptedLink(coach, student);
  useFake();
  const real = paymentFields(coach, student, link);
  await kit.webhook('payment.succeeded', real);
  const extra = paymentFields(coach, student, link);
  await kit.webhook('payment.succeeded', extra);
  await kit.webhook('membership.deactivated', { id: extra.membership_id, status: 'canceled', metadata: extra.metadata });
  assert.equal((await linkOf(link)).status, 'active');
  assert.notEqual((await subOf(real.membership_id)).status, 'ended');
  // The real one ending still ends the link.
  await kit.webhook('membership.deactivated', { id: real.membership_id, status: 'canceled', metadata: real.metadata });
  assert.equal((await linkOf(link)).status, 'ended');
  assert.equal((await subOf(real.membership_id)).status, 'ended');
});

test('a renewal on an ended link whose cancel is still pending is refunded and the coach is not credited', async () => {
  useFake({ failOn: ['cancelSubscription'] });
  const s = await switchSetup('ms-renewal');
  await kit.webhook('payment.succeeded', paymentFields(s.newCoach, s.student, s.newLink));
  assert.equal((await linkOf(s.oldLink)).status, 'ended');
  assert.equal(await savedCancel(s.oldPay.membership_id), 1);
  const before = await coachTotal(s.oldCoach.id);
  assert.equal(before, 2550);

  useFake();
  const renewal = paymentFields(s.oldCoach, s.student, s.oldLink, { membership_id: s.oldPay.membership_id });
  assert.equal((await kit.webhook('payment.succeeded', renewal)).status, 200);
  assert.equal(await coachTotal(s.oldCoach.id), before, 'coach not credited');
  assert.deepEqual(callsOf('refundPayment').map((c) => c.args.providerPaymentId), [renewal.id]);
  assert.deepEqual(
    (await ledgerFor(s.oldCoach.id)).map((r) => r.kind).sort(),
    ['payment', 'payment', 'refund']
  );
  // Replay: nothing more.
  await kit.webhook('payment.succeeded', renewal, { id: `msg_${kit.run}_renewal_again` });
  assert.equal((await ledgerFor(s.oldCoach.id)).length, 3);
  assert.equal(callsOf('refundPayment').length, 1);
});

/* --------------------- 4. unusable payments: refund --------------------- */

// A student with an active first coach and a second coach's link waiting for
// payment: the second payment can never go live.
async function blockedSetup(label) {
  const first = await kit.makeCoach(`${label}-a`, { ready: true });
  const second = await kit.makeCoach(`${label}-b`, { ready: true });
  const student = await kit.register(`${label}-stu`);
  const firstLink = await kit.acceptedLink(first, student);
  await kit.webhook('payment.succeeded', paymentFields(first, student, firstLink));
  const { rows } = await pool.query(
    `INSERT INTO coach_clients (coach_id, client_id, status, requested_by) VALUES ($1, $2, 'pending_payment', 'coach') RETURNING id`,
    [second.id, student.id]
  );
  return { first, second, student, secondLink: rows[0].id };
}

test('a payment that cannot go live is refunded, the coach is not credited, and replays do nothing', async () => {
  useFake();
  const s = await blockedSetup('ms-refund');
  const fields = paymentFields(s.second, s.student, s.secondLink);
  const eventId = `msg_${kit.run}_blocked`;
  assert.equal((await kit.webhook('payment.succeeded', fields, { id: eventId })).status, 200);

  assert.deepEqual(callsOf('refundPayment').map((c) => c.args.providerPaymentId), [fields.id]);
  const rows = await ledgerFor(s.second.id);
  assert.equal(rows.length, 2);
  assert.equal(await coachTotal(s.second.id), 0);
  assert.deepEqual(rows.map((r) => r.kind).sort(), ['payment', 'refund']);
  assert.equal((await pool.query('SELECT status FROM pending_refunds WHERE provider_payment_id = $1', [fields.id])).rows[0].status, 'done');

  // Same message again, and the same payment under a different message id.
  await kit.webhook('payment.succeeded', fields, { id: eventId });
  await kit.webhook('payment.succeeded', fields, { id: `msg_${kit.run}_blocked_again` });
  assert.equal((await ledgerFor(s.second.id)).length, 2);
  assert.equal(callsOf('refundPayment').length, 1);

  // The provider's own "refund done" message afterwards does not reverse a second time.
  await kit.webhook('refund.created', { id: `rf_${kit.run}_auto`, payment_id: fields.id, amount: 30, currency: 'usd', status: 'succeeded' });
  assert.equal((await ledgerFor(s.second.id)).length, 2);
});

test('a refund call that fails is kept and shown to the owner, then retried until it works', async () => {
  useFake({ failOn: ['refundPayment'] });
  const s = await blockedSetup('ms-refundfail');
  const fields = paymentFields(s.second, s.student, s.secondLink);
  assert.equal((await kit.webhook('payment.succeeded', fields)).status, 200);
  assert.equal(await coachTotal(s.second.id), 0, 'still not credited');
  assert.equal((await pool.query('SELECT status FROM pending_refunds WHERE provider_payment_id = $1', [fields.id])).rows[0].status, 'pending');
  assert.ok((await attention()).some((n) => n.id === fields.id && n.kind === 'refund_pending'));

  useFake();
  assert.equal((await runPay()).status, 200);
  assert.equal((await pool.query('SELECT status FROM pending_refunds WHERE provider_payment_id = $1', [fields.id])).rows[0].status, 'done');
  assert.deepEqual(callsOf('refundPayment').map((c) => c.args.providerPaymentId), [fields.id]);
  assert.equal((await ledgerFor(s.second.id)).length, 2, 'the ledger reversal was not written again');
});

test('a payment in another currency leaves a held, flagged row for the owner, and is refunded if it cannot be used', async () => {
  useFake();
  const s = await blockedSetup('ms-eur');
  const fields = paymentFields(s.second, s.student, s.secondLink, { currency: 'eur' });
  assert.equal((await kit.webhook('payment.succeeded', fields)).status, 200);
  const rows = await ledgerFor(s.second.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].owner_flag, 'non_usd_payment');
  assert.equal(rows[0].coach_cents, 0);
  assert.deepEqual(callsOf('refundPayment').map((c) => c.args.providerPaymentId), [fields.id]);
  assert.ok((await attention()).some((n) => n.id === rows[0].id && n.kind === 'non_usd_payment'));

  // A non-dollar refund message on a dollar payment is held and flagged, once.
  const coach = await kit.makeCoach('ms-eurref', { ready: true });
  const student = await kit.register('ms-eurref-stu');
  const link = await kit.acceptedLink(coach, student);
  const pay = paymentFields(coach, student, link);
  await kit.webhook('payment.succeeded', pay);
  const refund = { id: `rf_${kit.run}_eur`, payment_id: pay.id, amount: 30, currency: 'eur', status: 'succeeded' };
  await kit.webhook('refund.created', refund);
  await kit.webhook('refund.updated', refund);
  const eurRows = (await ledgerFor(coach.id)).filter((r) => r.kind === 'refund');
  assert.equal(eurRows.length, 1);
  assert.equal(eurRows[0].owner_flag, 'non_usd_reversal');
});

/* --------------------------- 5. checkout key --------------------------- */

test('the same-checkout key changes when the coach\'s price or account changes', async () => {
  useFake();
  const coach = await kit.makeCoach('ms-key', { ready: true, priceCents: 3000, accountId: `biz_key_a_${kit.run}` });
  const student = await kit.register('ms-key-stu');
  await kit.acceptedLink(coach, student);
  const keyNow = async () => {
    const res = await kit.call(student, 'POST', '/billing/coach-checkout', { coachId: coach.id });
    assert.equal(res.status, 200);
    return callsOf('createCheckout').at(-1).args.idempotencyKey;
  };
  const first = await keyNow();
  assert.equal(await keyNow(), first, 'unchanged price and account give the same key');
  await pool.query('UPDATE coach_profiles SET price_cents = 4000 WHERE user_id = $1', [coach.id]);
  const afterPrice = await keyNow();
  assert.notEqual(afterPrice, first);
  await pool.query(`UPDATE coach_subscriptions SET provider_account_id = $2 WHERE coach_id = $1`, [coach.id, `biz_key_b_${kit.run}`]);
  const afterAccount = await keyNow();
  assert.notEqual(afterAccount, afterPrice);
  assert.ok(afterAccount.includes(`biz_key_b_${kit.run}`) && afterAccount.includes('4000'));
});

/* ----------------------------- 6. disputes ----------------------------- */

async function paidCoach(label) {
  const coach = await kit.makeCoach(label, { ready: true });
  const student = await kit.register(`${label}-stu`);
  const link = await kit.acceptedLink(coach, student);
  const pay = paymentFields(coach, student, link);
  useFake();
  await kit.webhook('payment.succeeded', pay);
  return { coach, student, pay };
}
const dispute = (id, payId, status) => ({ id, amount: 30, currency: 'usd', status, payment: { id: payId } });

test('a dispute opening takes the coach\'s share back once, even if created and updated both say needs_response', async () => {
  const { coach, pay } = await paidCoach('ms-disp-open');
  const d = `dspt_${kit.run}_open`;
  await kit.webhook('dispute.created', dispute(d, pay.id, 'needs_response'));
  await kit.webhook('dispute.updated', dispute(d, pay.id, 'needs_response'));
  await kit.webhook('dispute.updated', dispute(d, pay.id, 'under_review'));
  const rows = (await ledgerFor(coach.id)).filter((r) => r.kind === 'chargeback');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].coach_cents, -2550);
  assert.equal(await coachTotal(coach.id), 0);
});

test('a dispute WON gives the share back, once, however many times it is announced', async () => {
  const { coach, pay } = await paidCoach('ms-disp-won');
  const d = `dspt_${kit.run}_won`;
  await kit.webhook('dispute.created', dispute(d, pay.id, 'needs_response'));
  assert.equal(await coachTotal(coach.id), 0);
  const won = dispute(d, pay.id, 'won');
  await kit.webhook('dispute.updated', won);
  await kit.webhook('dispute.updated', won);
  await kit.webhook('dispute.updated', won, { id: `msg_${kit.run}_won_replay` });
  const rows = await ledgerFor(coach.id);
  const restores = rows.filter((r) => r.kind === 'chargeback_won');
  assert.equal(restores.length, 1);
  assert.equal(restores[0].source_ref, `chargeback_won:${d}`);
  assert.equal(restores[0].coach_cents, 2550);
  assert.equal(await coachTotal(coach.id), 2550, 'back to what the coach was owed');
  // A late "still open" update after the win does not take it back again.
  await kit.webhook('dispute.updated', dispute(d, pay.id, 'needs_response'));
  assert.equal(await coachTotal(coach.id), 2550);
});

test('a dispute WON after the student was refunded outside Cut does not give back more than remains', async () => {
  const { coach, pay } = await paidCoach('ms-disp-refunded');
  const d = `dspt_${kit.run}_refunded`;
  const part = (status) => ({ id: d, amount: 10, currency: 'usd', status, payment: { id: pay.id } });
  await kit.webhook('dispute.created', part('needs_response'));
  assert.equal(await coachTotal(coach.id), 2550 - 850);
  // The whole payment is then refunded outside Cut, while the dispute is open.
  await kit.webhook('refund.created', { id: `rf_${kit.run}_outside`, payment_id: pay.id, amount: 30, currency: 'usd', status: 'succeeded' });
  assert.equal(await coachTotal(coach.id), -850);
  await kit.webhook('dispute.updated', part('won'));
  await kit.webhook('dispute.updated', part('won'), { id: `msg_${kit.run}_refunded_again` });
  assert.equal(await coachTotal(coach.id), 0, 'the coach ends at nothing, never above what remained after the refund');
  assert.equal((await ledgerFor(coach.id)).filter((r) => r.kind === 'chargeback_won').length, 1);
});

test('a dispute LOST changes nothing more', async () => {
  const { coach, pay } = await paidCoach('ms-disp-lost');
  const d = `dspt_${kit.run}_lost`;
  await kit.webhook('dispute.created', dispute(d, pay.id, 'needs_response'));
  await kit.webhook('dispute.updated', dispute(d, pay.id, 'lost'));
  const rows = await ledgerFor(coach.id);
  assert.equal(rows.length, 2);
  assert.equal(await coachTotal(coach.id), 0);
});

test('a "won" message that arrives BEFORE the opening still ends with the coach not out of pocket', async () => {
  const { coach, pay } = await paidCoach('ms-disp-order');
  const d = `dspt_${kit.run}_order`;
  await kit.webhook('dispute.updated', dispute(d, pay.id, 'won'));
  await kit.webhook('dispute.created', dispute(d, pay.id, 'needs_response'));
  assert.equal(await coachTotal(coach.id), 2550);
  assert.equal((await ledgerFor(coach.id)).filter((r) => r.kind === 'chargeback').length, 0);
});

test('the reader turns dispute messages into the right kinds', async () => {
  const { parseWebhookEvent } = await import('../lib/billing/index.js');
  const kindOf = (type, status) => parseWebhookEvent(buildFakeEvent(type, { id: 'dspt_x', status })).type;
  assert.equal(kindOf('dispute.created', 'needs_response'), 'payment.disputed');
  assert.equal(kindOf('dispute.updated', 'under_review'), 'payment.disputed');
  assert.equal(kindOf('dispute.updated', 'won'), 'payment.dispute_won');
  assert.equal(kindOf('dispute.updated', 'lost'), 'ignored');
});

/* ------------------------ reviewer follow-ups (Oct 2026) ------------------------ */

test('the same payment delivered again under a new message id AFTER the link ended plans no refund and no reversal', async () => {
  useFake();
  const coach = await kit.makeCoach('ms-late-replay', { ready: true });
  const student = await kit.register('ms-late-replay-stu');
  const linkId = await kit.acceptedLink(coach, student);
  const pay = paymentFields(coach, student, linkId);
  assert.equal((await kit.webhook('payment.succeeded', pay)).status, 200);
  assert.equal(await coachTotal(coach.id), 2550);

  // The coaching ends (student left), then the very same payment is announced again.
  await pool.query(`UPDATE coach_clients SET status = 'ended' WHERE id = $1`, [linkId]);
  assert.equal((await kit.webhook('payment.succeeded', pay, { id: `msg_${kit.run}_late_replay_new` })).status, 200);

  const rows = await ledgerFor(coach.id);
  assert.equal(rows.length, 1, 'no reversal row');
  assert.equal(rows[0].kind, 'payment');
  assert.equal(await coachTotal(coach.id), 2550, 'the coach keeps what was legitimately credited');
  assert.equal(callsOf('refundPayment').length, 0, 'no refund call');
  assert.equal((await pool.query('SELECT 1 FROM pending_refunds WHERE provider_payment_id = $1', [pay.id])).rowCount, 0);
});

test('retries try the least recently tried cancels first, so stuck ones never starve newer ones', async () => {
  const { retryPendingCancels } = await import('../lib/providerRetries.js');
  await pool.query('DELETE FROM pending_cancels');
  await pool.query(
    `INSERT INTO pending_cancels (provider_subscription_id, reason, created_at, updated_at)
     SELECT 'stuck_' || $1::text || '_' || g, 'test', now() - interval '3 days', now() - interval '2 days'
     FROM generate_series(1, 50) g`,
    [kit.run]
  );
  await pool.query(
    `INSERT INTO pending_cancels (provider_subscription_id, reason) VALUES ($1, 'test')`,
    [`fresh_${kit.run}`]
  );
  useFake();
  const works = fake.cancelSubscription;
  fake.cancelSubscription = async (args) => {
    if (args.providerSubscriptionId.startsWith('stuck_')) throw new BillingError('refused');
    return works(args);
  };
  const left = async () =>
    (await pool.query('SELECT provider_subscription_id FROM pending_cancels')).rows.map((r) => r.provider_subscription_id);
  await retryPendingCancels(); // the 50 stuck ones fill the batch and get pushed to the back
  await retryPendingCancels(); // so the newer one is reached now
  const remaining = await left();
  assert.equal(remaining.includes(`fresh_${kit.run}`), false, 'the newer cancel went through');
  assert.equal(remaining.length, 50);
  await pool.query('DELETE FROM pending_cancels');
});

test('a cancel the payment company says is already gone counts as done, and the saved retry is cleared', async () => {
  const { stopSubscriptionsWhere } = await import('../lib/stopSubscriptions.js');
  const { retryPendingCancels } = await import('../lib/providerRetries.js');
  const coach = await kit.makeCoach('ms-gone', { ready: true });
  const student = await kit.register('ms-gone-stu');
  const linkId = await kit.acceptedLink(coach, student);
  const pay = paymentFields(coach, student, linkId);
  useFake();
  await kit.webhook('payment.succeeded', pay);
  useFake({ failOn: ['cancelSubscription'] });
  await stopSubscriptionsWhere('cc.id = $1', [linkId]);
  const saved = () => pool.query('SELECT 1 FROM pending_cancels WHERE provider_subscription_id = $1', [pay.membership_id]);
  assert.equal((await saved()).rowCount, 1);

  useFake({ cancelAlreadyGone: true });
  await retryPendingCancels();
  assert.equal((await saved()).rowCount, 0, 'saved cancel removed');
  assert.equal((await subOf(pay.membership_id)).cancel_at_period_end, true);
});

test('a payout the owner marked not sent, later found paid by the payment company, is flagged once and money is untouched', async () => {
  const { coach, payout } = await parkedPayout('ms-paid-after-failed');
  assert.equal((await resolve(payout.id, { outcome: 'failed', note: 'Not in the list' })).status, 200);
  assert.equal((await ledgerFor(coach.id))[0].payout_id, null);

  // The payment company turns out to have sent it.
  useFake();
  fake.plantTransfer(payout.id, 'paid');
  await runPay();
  await runPay(); // a second run must not flag it twice
  const row = (await payoutsOf(coach.id)).find((r) => r.id === payout.id);
  assert.equal(row.status, 'failed', 'its status is not changed behind the owner\'s back');
  assert.equal(row.attention, 'paid_after_marked_failed');
  const sentence =
    'A payout you marked as not sent was actually sent by the payment company; the coach may be paid twice. Check now.';
  const flags = (await attention()).filter((n) => n.id === payout.id);
  assert.equal(flags.length, 1);
  assert.ok(flags[0].message.startsWith(sentence));
  assert.equal(
    (await pool.query('SELECT 1 FROM commission_ledger WHERE payout_id = $1', [payout.id])).rowCount,
    0,
    'the check itself moved no money'
  );

  // A payout marked not sent that really was NOT sent is never flagged.
  const other = await parkedPayout('ms-not-sent-ok');
  await resolve(other.payout.id, { outcome: 'failed', note: 'checked' });
  useFake();
  await runPay();
  assert.equal((await payoutsOf(other.coach.id)).find((r) => r.id === other.payout.id).attention, null);
});

test('a payout Cut released itself (lookup found nothing), later found paid, is flagged once and money is untouched', async () => {
  const coach = await coachWithOwedMoney('ms-auto-released');
  const payout = await pendingPayout(coach, { ageMinutes: 60 });
  // Nothing found after the waiting time: Cut frees the money itself. The new payout that follows stays pending.
  useFake({ failOn: { transferToCoach: unknownError() } });
  await runPay();
  const released = (await payoutsOf(coach.id)).find((r) => r.id === payout.id);
  assert.equal(released.status, 'failed');
  assert.equal(released.resolution_note, null, 'released by Cut, not by the owner');

  // The transfer turns up late. The re-check looks at a limited number of
  // payouts per press, least-recently-checked first; other tests leave many
  // failed payouts behind, so put those at the back of the queue.
  await pool.query(`UPDATE payouts SET recheck_at = now() WHERE status = 'failed' AND id <> $1`, [payout.id]);
  fake.plantTransfer(payout.id, 'paid');
  await runPay();
  await runPay(); // not flagged twice
  const row = (await payoutsOf(coach.id)).find((r) => r.id === payout.id);
  assert.equal(row.status, 'failed', 'status untouched');
  assert.equal(row.attention, 'paid_after_marked_failed');
  assert.equal((await pool.query('SELECT 1 FROM commission_ledger WHERE payout_id = $1', [payout.id])).rowCount, 0);
  const flags = (await attention()).filter((n) => n.id === payout.id);
  assert.equal(flags.length, 1);
  assert.match(flags[0].message, /Cut released itself/);
  assert.match(flags[0].message, /may be paid twice/);

  // An auto-released payout older than 30 days is no longer re-checked.
  const old = await coachWithOwedMoney('ms-auto-old');
  const oldPayout = await pendingPayout(old, { ageMinutes: 60 });
  useFake({ failOn: { transferToCoach: unknownError() } });
  await runPay();
  await pool.query(`UPDATE payouts SET updated_at = now() - interval '31 days' WHERE id = $1`, [oldPayout.id]);
  fake.plantTransfer(oldPayout.id, 'paid');
  await runPay();
  assert.equal((await payoutsOf(old.id)).find((r) => r.id === oldPayout.id).attention, null);
});

test('a coaching payment with no usable amount leaves a held, flagged row for the owner', async () => {
  useFake();
  const coach = await kit.makeCoach('ms-noamount', { ready: true });
  const student = await kit.register('ms-noamount-stu');
  const link = await kit.acceptedLink(coach, student);
  const fields = paymentFields(coach, student, link, { total: null });
  assert.equal((await kit.webhook('payment.succeeded', fields)).status, 200);
  const rows = await ledgerFor(coach.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].owner_flag, 'non_usd_payment');
  assert.equal(rows[0].coach_cents, 0);
  assert.ok((await attention()).some((n) => n.id === rows[0].id));
  // A replay changes nothing.
  assert.equal((await kit.webhook('payment.succeeded', fields)).status, 200);
  assert.equal((await ledgerFor(coach.id)).length, 1);
});

test('an automatic reversal with no payment id to refund with is flagged for the owner', async () => {
  useFake();
  const { parseWebhookEvent } = await import('../lib/billing/index.js');
  const { applyBillingEvent } = await import('../lib/billingEvents.js');
  const s = await blockedSetup('ms-noid');
  const fields = paymentFields(s.second, s.student, s.secondLink);
  const event = parseWebhookEvent(buildFakeEvent('payment.succeeded', fields, { id: `msg_${kit.run}_noid` }));
  event.providerPaymentId = null;
  await applyBillingEvent(event);
  const rows = await ledgerFor(s.second.id);
  assert.equal(rows.length, 2, 'payment and its reversal');
  assert.equal(await coachTotal(s.second.id), 0);
  const flagged = rows.filter((r) => r.owner_flag === 'non_usd_reversal');
  assert.equal(flagged.length, 1);
  assert.ok((await attention()).some((n) => n.id === flagged[0].id && n.kind === 'reversal_needs_attention'));
  assert.equal(callsOf('refundPayment').length, 0, 'nothing could be refunded');
});
