// Webhook checks: is the signature right, is the message fresh, and is it read
// into the right provider-neutral facts. No database, no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyWebhook, parseWebhookEvent } from './index.js';
import { buildFakeEvent, signTestWebhook } from './fake.js';

const SECRET = 'ws_test_secret_value';
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const NOW_SECONDS = Math.floor(NOW / 1000);
const BODY = buildFakeEvent('payment.succeeded');

function good(overrides = {}) {
  return signTestWebhook(BODY, SECRET, { id: 'msg_1', timestamp: NOW_SECONDS, ...overrides });
}

/* ---------------- signature ---------------- */

test('a correctly signed, fresh webhook is ok', () => {
  assert.equal(verifyWebhook(BODY, good(), SECRET, NOW), 'ok');
});

test('the signature is HMAC-SHA256 of id.timestamp.body keyed by the secret text itself', () => {
  const expected = createHmac('sha256', Buffer.from(SECRET, 'utf8'))
    .update(`msg_1.${NOW_SECONDS}.${BODY}`)
    .digest('base64');
  assert.equal(good()['webhook-signature'], `v1,${expected}`);
});

test('a Buffer body verifies the same as the string', () => {
  assert.equal(verifyWebhook(Buffer.from(BODY), good(), SECRET, NOW), 'ok');
});

test('header names work in any capitalisation and as a Headers object', () => {
  const h = good();
  const upper = {
    'Webhook-Id': h['webhook-id'],
    'WEBHOOK-TIMESTAMP': h['webhook-timestamp'],
    'Webhook-Signature': h['webhook-signature'],
  };
  assert.equal(verifyWebhook(BODY, upper, SECRET, NOW), 'ok');
  assert.equal(verifyWebhook(BODY, new Headers(h), SECRET, NOW), 'ok');
});

test('a wrong secret is a bad signature', () => {
  assert.equal(verifyWebhook(BODY, good(), 'ws_other', NOW), 'bad_signature');
});

test('a changed body is a bad signature', () => {
  assert.equal(verifyWebhook(BODY.replace('30', '3000'), good(), SECRET, NOW), 'bad_signature');
});

test('a changed id or timestamp is a bad signature', () => {
  const h = good();
  assert.equal(verifyWebhook(BODY, { ...h, 'webhook-id': 'msg_2' }, SECRET, NOW), 'bad_signature');
  assert.equal(
    verifyWebhook(BODY, { ...h, 'webhook-timestamp': String(NOW_SECONDS + 1) }, SECRET, NOW),
    'bad_signature'
  );
});

test('missing headers, body or secret are reported as missing', () => {
  const h = good();
  for (const name of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
    const copy = { ...h };
    delete copy[name];
    assert.equal(verifyWebhook(BODY, copy, SECRET, NOW), 'missing', name);
  }
  assert.equal(verifyWebhook(BODY, {}, SECRET, NOW), 'missing');
  assert.equal(verifyWebhook(BODY, undefined, SECRET, NOW), 'missing');
  assert.equal(verifyWebhook(undefined, h, SECRET, NOW), 'missing');
  assert.equal(verifyWebhook(BODY, h, '', NOW), 'missing');
  assert.equal(verifyWebhook(BODY, h, undefined, NOW), 'missing');
});

test('non-numeric or odd timestamps are refused', () => {
  for (const ts of ['abc', '1e9', '-5', '12.5', '', '99999999999999']) {
    const h = signTestWebhook(BODY, SECRET, { id: 'msg_1', timestamp: ts });
    const result = verifyWebhook(BODY, h, SECRET, NOW);
    assert.notEqual(result, 'ok', `timestamp "${ts}"`);
    assert.notEqual(result, 'stale', `timestamp "${ts}" must not look stale`);
  }
});

test('several signatures: any one valid is enough, junk entries are skipped', () => {
  const h = good();
  const real = h['webhook-signature'];
  assert.equal(verifyWebhook(BODY, { ...h, 'webhook-signature': `v1,AAAA ${real}` }, SECRET, NOW), 'ok');
  assert.equal(verifyWebhook(BODY, { ...h, 'webhook-signature': `${real} v1,AAAA` }, SECRET, NOW), 'ok');
  assert.equal(
    verifyWebhook(BODY, { ...h, 'webhook-signature': `v2,xyz garbage  ${real}` }, SECRET, NOW),
    'ok'
  );
  assert.equal(verifyWebhook(BODY, { ...h, 'webhook-signature': 'v1,AAAA v1,BBBB' }, SECRET, NOW), 'bad_signature');
});

test('only v1 entries count, and a bare or truncated signature fails', () => {
  const h = good();
  const b64 = h['webhook-signature'].slice(3);
  assert.equal(verifyWebhook(BODY, { ...h, 'webhook-signature': `v2,${b64}` }, SECRET, NOW), 'bad_signature');
  assert.equal(verifyWebhook(BODY, { ...h, 'webhook-signature': b64 }, SECRET, NOW), 'bad_signature');
  assert.equal(verifyWebhook(BODY, { ...h, 'webhook-signature': `v1,${b64.slice(0, -4)}` }, SECRET, NOW), 'bad_signature');
  assert.equal(verifyWebhook(BODY, { ...h, 'webhook-signature': `v1,${b64}x` }, SECRET, NOW), 'bad_signature');
});

test('five minutes either side is fresh; beyond is stale', () => {
  const at = (offsetSeconds) => signTestWebhook(BODY, SECRET, { id: 'msg_1', timestamp: NOW_SECONDS + offsetSeconds });
  assert.equal(verifyWebhook(BODY, at(-300), SECRET, NOW), 'ok');
  assert.equal(verifyWebhook(BODY, at(300), SECRET, NOW), 'ok');
  assert.equal(verifyWebhook(BODY, at(-301), SECRET, NOW), 'stale');
  assert.equal(verifyWebhook(BODY, at(301), SECRET, NOW), 'stale');
});

test('stale is only ever said once the signature is valid', () => {
  const old = NOW_SECONDS - 3600;
  const forged = { ...signTestWebhook(BODY, 'ws_wrong', { id: 'msg_1', timestamp: old }) };
  assert.equal(verifyWebhook(BODY, forged, SECRET, NOW), 'bad_signature');
  assert.equal(
    verifyWebhook(BODY, signTestWebhook(BODY, SECRET, { id: 'msg_1', timestamp: old }), SECRET, NOW),
    'stale'
  );
});

test('a replayed header set with a different body still fails', () => {
  const other = buildFakeEvent('payment.succeeded', { total: 1 });
  assert.equal(verifyWebhook(other, good(), SECRET, NOW), 'bad_signature');
});

/* ---------------- reading events ---------------- */

const USER = '11111111-1111-4111-8111-111111111111';
const COACH = '22222222-2222-4222-8222-222222222222';
const LINK = '33333333-3333-4333-8333-333333333333';
const META = { userId: USER, kind: 'coach_student', interval: 'month', coachUserId: COACH, linkId: LINK, reference: 'ref-9' };

test('unreadable bodies give null', () => {
  assert.equal(parseWebhookEvent('not json'), null);
  assert.equal(parseWebhookEvent('[1,2]'), null);
  assert.equal(parseWebhookEvent('null'), null);
  assert.equal(parseWebhookEvent(undefined), null);
  assert.equal(parseWebhookEvent(12), null);
});

test('odd shapes never throw and read as ignored', () => {
  for (const body of ['{}', '{"type":5}', '{"type":"payment.succeeded"}', '{"type":"payment.succeeded","data":7}', '{"data":{"metadata":"x"}}']) {
    const event = parseWebhookEvent(body);
    assert.ok(event, body);
    assert.ok(typeof event.type === 'string');
  }
  assert.equal(parseWebhookEvent('{}').type, 'ignored');
  assert.equal(parseWebhookEvent('{"type":"payment.succeeded"}').amountCents, null);
});

test('payment.succeeded carries the payment, money, subscription and metadata', () => {
  const body = buildFakeEvent(
    'payment.succeeded',
    {
      id: 'pay_abc',
      total: 29.99,
      currency: 'usd',
      membership_id: 'mem_abc',
      user_id: 'user_abc',
      metadata: META,
      current_period_start: '2026-10-01T00:00:00Z',
      current_period_end: '2026-10-31T00:00:00Z',
    },
    { id: 'msg_xyz', account_id: 'biz_coach1' }
  );
  const event = parseWebhookEvent(body);
  assert.equal(event.type, 'payment.succeeded');
  assert.equal(event.eventId, 'msg_xyz');
  assert.equal(event.providerPaymentId, 'pay_abc');
  assert.equal(event.providerEventRef, 'pay_abc');
  assert.equal(event.providerSubscriptionId, 'mem_abc');
  assert.equal(event.providerCustomerId, 'user_abc');
  assert.equal(event.providerAccountId, 'biz_coach1');
  assert.equal(event.amountCents, 2999);
  assert.equal(event.currency, 'usd');
  assert.equal(event.periodStart, '2026-10-01T00:00:00.000Z');
  assert.equal(event.periodEnd, '2026-10-31T00:00:00.000Z');
  assert.deepEqual(event.metadata, META);
  assert.equal(event.refundedPaymentId, null);
});

test('dollar amounts convert to whole cents without float drift', () => {
  for (const [dollars, cents] of [[0.29, 29], [12.99, 1299], [89.99, 8999], [49, 4900], ['30.00', 3000], [19.99, 1999]]) {
    const event = parseWebhookEvent(buildFakeEvent('payment.succeeded', { total: dollars }));
    assert.equal(event.amountCents, cents, String(dollars));
  }
  assert.equal(parseWebhookEvent(buildFakeEvent('payment.succeeded', { total: 'abc', amount: undefined })).amountCents, null);
});

test('metadata is only trusted in the right shape', () => {
  const event = parseWebhookEvent(
    buildFakeEvent('payment.succeeded', {
      metadata: { userId: 'not-a-uuid', kind: 'hack', interval: 'week', coachUserId: 5, linkId: '../x', reference: 'r'.repeat(500) },
    })
  );
  assert.equal(event.metadata.userId, null);
  assert.equal(event.metadata.kind, null);
  assert.equal(event.metadata.interval, null);
  assert.equal(event.metadata.coachUserId, null);
  assert.equal(event.metadata.linkId, null);
  assert.equal(event.metadata.reference.length, 200);
});

test('metadata accepts snake_case spellings', () => {
  const event = parseWebhookEvent(buildFakeEvent('payment.succeeded', { metadata: { user_id: USER, coach_user_id: COACH, kind: 'ai_plan', interval: 'year' } }));
  assert.equal(event.metadata.userId, USER);
  assert.equal(event.metadata.coachUserId, COACH);
  assert.equal(event.metadata.kind, 'ai_plan');
  assert.equal(event.metadata.interval, 'year');
});

test('payment.failed maps through with its payment and subscription', () => {
  const event = parseWebhookEvent(buildFakeEvent('payment.failed', { id: 'pay_f1', metadata: META }));
  assert.equal(event.type, 'payment.failed');
  assert.equal(event.providerPaymentId, 'pay_f1');
  assert.equal(event.providerSubscriptionId, 'mem_fake1');
  assert.equal(event.metadata.userId, USER);
});

test('a succeeded refund becomes payment.refunded keyed by the refund id', () => {
  for (const type of ['refund.created', 'refund.updated']) {
    const event = parseWebhookEvent(buildFakeEvent(type, { id: 'rf_77', payment_id: 'pay_abc', amount: 10.5 }));
    assert.equal(event.type, 'payment.refunded');
    assert.equal(event.providerEventRef, 'rf_77');
    assert.equal(event.refundedPaymentId, 'pay_abc');
    assert.equal(event.amountCents, 1050);
  }
});

test('refund metadata is found on the payment inside the refund', () => {
  const event = parseWebhookEvent(buildFakeEvent('refund.created', { payment: { id: 'pay_abc', metadata: META }, payment_id: undefined }));
  assert.equal(event.refundedPaymentId, 'pay_abc');
  assert.equal(event.metadata.userId, USER);
});

test('a refund that has not succeeded is ignored', () => {
  for (const status of ['pending', 'requires_action', 'failed', 'canceled']) {
    assert.equal(parseWebhookEvent(buildFakeEvent('refund.updated', { status })).type, 'ignored', status);
  }
});

test('a dispute becomes payment.disputed keyed by the dispute id', () => {
  const event = parseWebhookEvent(buildFakeEvent('dispute.created', { id: 'dspt_9', amount: 30, payment: { id: 'pay_abc' } }));
  assert.equal(event.type, 'payment.disputed');
  assert.equal(event.providerEventRef, 'dspt_9');
  assert.equal(event.providerPaymentId, 'pay_abc');
  assert.equal(event.amountCents, 3000);
});

test('membership events map to subscription events', () => {
  const started = parseWebhookEvent(buildFakeEvent('membership.activated', { id: 'mem_5', metadata: META }));
  assert.equal(started.type, 'subscription.started');
  assert.equal(started.providerSubscriptionId, 'mem_5');
  assert.equal(started.periodEnd, '2026-10-31T00:00:00.000Z');
  assert.equal(started.metadata.linkId, LINK);

  const scheduled = parseWebhookEvent(buildFakeEvent('membership.cancel_at_period_end_changed', { cancel_at_period_end: true }));
  assert.equal(scheduled.type, 'subscription.cancel_scheduled');

  const undone = parseWebhookEvent(buildFakeEvent('membership.cancel_at_period_end_changed', { cancel_at_period_end: false }));
  assert.equal(undone.type, 'ignored');

  const ended = parseWebhookEvent(buildFakeEvent('membership.deactivated'));
  assert.equal(ended.type, 'subscription.ended');
});

test('identity events mark the coach verified; other account states do not', () => {
  assert.equal(parseWebhookEvent(buildFakeEvent('identity_profile.approved')).type, 'coach.identity_verified');
  assert.equal(parseWebhookEvent(buildFakeEvent('verification.succeeded')).type, 'coach.identity_verified');
  const connected = parseWebhookEvent(buildFakeEvent('payout_account.status_updated', { status: 'connected' }, { account_id: 'biz_c9' }));
  assert.equal(connected.type, 'coach.identity_verified');
  assert.equal(connected.providerAccountId, 'biz_c9');
  for (const status of ['action_required', 'pending_verification', 'denied', undefined]) {
    assert.equal(parseWebhookEvent(buildFakeEvent('payout_account.status_updated', { status })).type, 'ignored');
  }
  assert.equal(parseWebhookEvent(buildFakeEvent('identity_profile.rejected')).type, 'ignored');
});

test('events Cut does not use are ignored but still readable', () => {
  for (const type of ['payment.pending', 'transfer.completed', 'membership.trial_ending_soon', 'dispute.updated', 'account.updated']) {
    const event = parseWebhookEvent(buildFakeEvent(type));
    assert.equal(event.type, 'ignored', type);
    assert.equal(event.eventId, 'msg_fake1');
  }
});

test('the older company_id envelope field still names the account', () => {
  const body = JSON.stringify({ id: 'msg_1', type: 'payment.succeeded', company_id: 'biz_old', data: { id: 'pay_1', total: 10 } });
  assert.equal(parseWebhookEvent(body).providerAccountId, 'biz_old');
});

test('unsafe provider ids are dropped rather than stored', () => {
  const event = parseWebhookEvent(buildFakeEvent('payment.succeeded', { id: "pay_1'; DROP TABLE x;--", membership_id: '../etc' }));
  assert.equal(event.providerPaymentId, null);
  assert.equal(event.providerSubscriptionId, null);
});
