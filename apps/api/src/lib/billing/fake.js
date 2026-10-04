// Test helpers for the money side. Nothing in the app imports this file; tests
// do. It gives them:
//   - a fake billing client that records every call and never touches a network,
//   - signTestWebhook(): the three signed headers a real webhook would carry,
//   - buildFakeEvent(): a raw webhook body in Whop's envelope shape.
//
// The signing code is written out here on purpose (not imported from whop.js),
// so a mistake in the real check can't be hidden by the test using the same
// mistake.

import { createHmac } from 'node:crypto';
import { BillingError } from './config.js';

const CLIENT_METHODS = [
  'createCheckout',
  'createCoachOnboardingLink',
  'cancelSubscription',
  'transferToCoach',
  'getPayoutStatus',
  'findTransferByKey',
  'refundPayment',
];

// A client that behaves like the real one with fixed, predictable answers.
//   failOn      — a method name, a list of names, or { name: errorOrMessage }:
//                 those calls throw a plain BillingError.
//   transferStatus — what transferToCoach reports ('paid' by default).
//   periodEnd   — what cancelSubscription reports.
//   cancelAlreadyGone — cancelSubscription answers { alreadyGone: true } (the
//                 payment company no longer has that subscription).
// Every call is pushed onto `.calls` as { method, args } before anything else
// happens, including calls that then fail.
export function createFakeBillingClient({
  failOn = [],
  transferStatus = 'paid',
  periodEnd = '2030-01-31T00:00:00.000Z',
  cancelAlreadyGone = false,
} = {}) {
  const calls = [];
  const transfers = new Map(); // idempotency key -> reference, so repeats don't pay twice
  const refunded = new Set(); // payment ids already refunded
  const keylessTransfers = []; // planted transfers that carry no key: { providerAccountId, createdAt }
  const knownTransfers = new Map(); // key -> { providerReference, status }: what a lookup can find

  const failures =
    typeof failOn === 'string'
      ? { [failOn]: true }
      : Array.isArray(failOn)
        ? Object.fromEntries(failOn.map((name) => [name, true]))
        : failOn ?? {};

  function record(method, args) {
    calls.push({ method, args });
    const failure = failures[method];
    if (failure) {
      throw failure instanceof Error
        ? failure
        : new BillingError(typeof failure === 'string' ? failure : 'The payment provider could not complete that.');
    }
  }

  const client = {
    calls,

    async createCheckout(args) {
      record('createCheckout', args);
      const slug = args?.reference ?? `${args?.kind}-${args?.userId}`;
      return { url: `https://sandbox.whop.com/checkout/fake-${slug}` };
    },

    async createCoachOnboardingLink(args) {
      record('createCoachOnboardingLink', args);
      const providerAccountId = args?.providerAccountId ?? `biz_fake_${args?.coachUserId}`;
      return { url: `https://sandbox.whop.com/onboarding/fake-${providerAccountId}`, providerAccountId };
    },

    async cancelSubscription(args) {
      record('cancelSubscription', args);
      if (cancelAlreadyGone) return { alreadyGone: true };
      return { periodEnd };
    },

    async transferToCoach(args) {
      record('transferToCoach', args);
      const key = args?.idempotencyKey;
      if (!transfers.has(key)) transfers.set(key, `fake_transfer_${key}`);
      knownTransfers.set(key, { providerReference: transfers.get(key), status: transferStatus });
      return { providerReference: transfers.get(key), status: transferStatus };
    },

    async getPayoutStatus(args) {
      record('getPayoutStatus', args);
      return { status: transferStatus };
    },
  };

  // Looks up a transfer by its key: only ones this fake actually sent, or ones
  // a test planted with plantTransfer() (a send that "went through" even though
  // the caller saw an error).
  client.findTransferByKey = async (args) => {
    record('findTransferByKey', args);
    const hit = knownTransfers.get(args?.idempotencyKey);
    if (!hit) {
      // Same rule as the real client: a keyless transfer to the same account
      // within 24 hours of the payout is a possible match, so we cannot say "not found".
      const created = new Date(args?.createdAt).getTime();
      const near = keylessTransfers.some((t) => t.providerAccountId === args?.providerAccountId
        && (!Number.isFinite(created) || Math.abs(t.createdAt.getTime() - created) <= 24 * 60 * 60 * 1000));
      if (near) throw new BillingError('A transfer without our reference was found near this payout\'s time.', { possibleMatch: true });
    }
    return hit ? { found: true, ...hit } : { found: false };
  };
  client.plantKeylessTransfer = (providerAccountId, createdAt) => {
    keylessTransfers.push({ providerAccountId, createdAt: new Date(createdAt) });
  };
  client.plantTransfer = (key, status = 'paid') => {
    knownTransfers.set(key, { providerReference: `fake_transfer_${key}`, status });
  };

  client.refundPayment = async (args) => {
    record('refundPayment', args);
    refunded.add(args?.providerPaymentId);
    return { refunded: true };
  };

  // Handy for a test that wants every method name.
  Object.defineProperty(client, 'methodNames', { value: CLIENT_METHODS, enumerable: false });
  return client;
}

// The headers a genuine webhook for this body would carry, signed with
// `secret`. Pass { id, timestamp } (timestamp in unix seconds) to control them.
export function signTestWebhook(rawBody, secret, { id = 'msg_test_1', timestamp } = {}) {
  const ts = String(timestamp ?? Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(`${id}.${ts}.${rawBody}`)
    .digest('base64');
  return {
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': `v1,${signature}`,
  };
}

// Sensible default contents per event type, so a test only names what it cares
// about. `fields` are merged over these and become the event's `data`.
const DEFAULT_DATA = {
  'payment.succeeded': {
    id: 'pay_fake1',
    status: 'paid',
    total: 30,
    currency: 'usd',
    membership_id: 'mem_fake1',
    user_id: 'user_fake1',
    billing_reason: 'subscription_create',
  },
  'payment.failed': {
    id: 'pay_fake1',
    status: 'open',
    substatus: 'failed',
    total: 30,
    currency: 'usd',
    membership_id: 'mem_fake1',
    user_id: 'user_fake1',
    decline_code: 'insufficient_funds',
  },
  'refund.created': { id: 'rf_fake1', payment_id: 'pay_fake1', amount: 30, currency: 'usd', status: 'succeeded' },
  'refund.updated': { id: 'rf_fake1', payment_id: 'pay_fake1', amount: 30, currency: 'usd', status: 'succeeded' },
  'dispute.created': {
    id: 'dspt_fake1',
    amount: 30,
    currency: 'usd',
    status: 'needs_response',
    payment: { id: 'pay_fake1' },
  },
  'dispute.updated': {
    id: 'dspt_fake1',
    amount: 30,
    currency: 'usd',
    status: 'needs_response',
    payment: { id: 'pay_fake1' },
  },
  'membership.activated': {
    id: 'mem_fake1',
    status: 'active',
    user_id: 'user_fake1',
    cancel_at_period_end: false,
    current_period_start: '2026-10-01T00:00:00.000Z',
    current_period_end: '2026-10-31T00:00:00.000Z',
  },
  'membership.deactivated': { id: 'mem_fake1', status: 'canceled', user_id: 'user_fake1' },
  'membership.cancel_at_period_end_changed': {
    id: 'mem_fake1',
    status: 'active',
    cancel_at_period_end: true,
    current_period_end: '2026-10-31T00:00:00.000Z',
  },
  'identity_profile.approved': { id: 'idpf_fake1', status: 'approved' },
  'verification.succeeded': { id: 'idpf_fake1', status: 'approved' },
  'payout_account.status_updated': { id: 'poact_fake1', status: 'connected' },
};

// A raw webhook body (a JSON string) in Whop's envelope shape:
// { id, type, api_version, api_version_date, timestamp, account_id, data }.
// `type` is Whop's own event name; `fields` become `data` (over the defaults);
// `envelope` can override id, account_id or timestamp.
export function buildFakeEvent(type, fields = {}, envelope = {}) {
  const data = { ...(DEFAULT_DATA[type] ?? {}), ...fields };
  return JSON.stringify({
    id: envelope.id ?? 'msg_fake1',
    type,
    api_version: 'v1',
    api_version_date: '2025-01-01',
    timestamp: envelope.timestamp ?? '2026-10-01T12:00:00.000Z',
    account_id: envelope.account_id ?? 'biz_fake_coach',
    data,
  });
}
