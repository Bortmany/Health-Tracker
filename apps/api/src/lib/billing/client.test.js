// The Whop client, run against a stand-in for the network: exact addresses,
// methods, bodies, the auth header, idempotency keys, and plain errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWhopClient } from './whop.js';
import { billingConfig, BillingError } from './config.js';

const USER = '11111111-1111-4111-8111-111111111111';
const COACH = '22222222-2222-4222-8222-222222222222';
const LINK = '33333333-3333-4333-8333-333333333333';
const API_KEY = 'whop_key_SUPERSECRET_123';

function config(extra = {}) {
  return billingConfig({
    WHOP_API_KEY: API_KEY,
    WHOP_WEBHOOK_SECRET: 'ws_x',
    WHOP_COMPANY_ID: 'biz_platform',
    ...extra,
  });
}

// A fake fetch that records requests and replies from a queue.
function fakeFetch(...replies) {
  const requests = [];
  const queue = [...replies];
  async function fetchImpl(url, init) {
    requests.push({ url, ...init, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const reply = queue.length > 1 ? queue.shift() : queue[0];
    if (reply instanceof Error) throw reply;
    return {
      ok: (reply.status ?? 200) < 400,
      status: reply.status ?? 200,
      json: async () => {
        if (reply.badJson) throw new Error('not json');
        return reply.body;
      },
    };
  }
  fetchImpl.requests = requests;
  return fetchImpl;
}

/* ---------------- base address and auth ---------------- */

test('sandbox is the default and live only when asked', async () => {
  const sandbox = fakeFetch({ body: { purchase_url: 'https://sandbox.whop.com/checkout/x' } });
  await createWhopClient(config(), { fetch: sandbox }).createCheckout({
    kind: 'ai_plan', interval: 'month', userId: USER, amountCents: 1299, successUrl: 'https://app.test/ok', cancelUrl: 'https://app.test/no', reference: 'r',
  });
  assert.equal(sandbox.requests[0].url, 'https://sandbox-api.whop.com/api/v1/checkout_configurations');

  const live = fakeFetch({ body: { purchase_url: 'https://whop.com/checkout/x' } });
  await createWhopClient(config({ WHOP_ENV: 'live' }), { fetch: live }).createCheckout({
    kind: 'ai_plan', interval: 'month', userId: USER, amountCents: 1299, successUrl: 'https://app.test/ok', reference: 'r',
  });
  assert.equal(live.requests[0].url, 'https://api.whop.com/api/v1/checkout_configurations');

  const typo = fakeFetch({ body: { purchase_url: 'https://whop.com/checkout/x' } });
  await createWhopClient(config({ WHOP_ENV: 'prod' }), { fetch: typo }).createCheckout({
    kind: 'ai_plan', interval: 'month', userId: USER, amountCents: 1299, successUrl: 'https://app.test/ok', reference: 'r',
  });
  assert.match(typo.requests[0].url, /^https:\/\/sandbox-api\.whop\.com/);
});

test('every request carries the bearer key, JSON headers, a timeout and no redirects', async () => {
  const f = fakeFetch({ body: { purchase_url: 'https://whop.com/checkout/x' } });
  await createWhopClient(config(), { fetch: f }).createCheckout({
    kind: 'ai_plan', interval: 'year', userId: USER, amountCents: 8999, successUrl: 'https://app.test/ok', reference: 'r',
  });
  const request = f.requests[0];
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.Authorization, `Bearer ${API_KEY}`);
  assert.equal(request.headers['Content-Type'], 'application/json');
  assert.ok(request.signal instanceof AbortSignal);
  assert.equal(request.redirect, 'manual');
  assert.ok(request.headers['Idempotency-Key'].length > 8);
  // No pinned API version: application_fee_amount needs the default version.
  assert.equal(request.headers['Api-Version-Date'], undefined);
});

/* ---------------- checkout ---------------- */

test('startup fee uses the configured plan id on the platform account', async () => {
  const f = fakeFetch({ body: { purchase_url: 'https://sandbox.whop.com/checkout/ch_1' } });
  const client = createWhopClient(config({ WHOP_STARTUP_FEE_PLAN_ID: 'plan_fee' }), { fetch: f });
  const result = await client.createCheckout({
    kind: 'coach_startup_fee', userId: USER, amountCents: 4900, successUrl: 'https://app.test/done', reference: 'fee-1',
  });
  assert.deepEqual(result, { url: 'https://sandbox.whop.com/checkout/ch_1' });
  assert.deepEqual(f.requests[0].body, {
    redirect_url: 'https://app.test/done',
    metadata: { userId: USER, kind: 'coach_startup_fee', reference: 'fee-1' },
    plan_id: 'plan_fee',
  });
});

test('startup fee without a plan id is described inline in dollars', async () => {
  const f = fakeFetch({ body: { purchase_url: 'https://whop.com/checkout/ch_1' } });
  await createWhopClient(config(), { fetch: f }).createCheckout({
    kind: 'coach_startup_fee', userId: USER, amountCents: 4900, successUrl: 'https://app.test/done', reference: 'fee-1',
  });
  const body = f.requests[0].body;
  assert.equal(body.plan_id, undefined);
  assert.equal(body.plan.company_id, 'biz_platform');
  assert.equal(body.plan.plan_type, 'one_time');
  assert.equal(body.plan.initial_price, 49);
  assert.equal(body.plan.currency, 'usd');
});

test('AI plan picks the monthly or yearly plan id', async () => {
  const f = fakeFetch({ body: { purchase_url: 'https://whop.com/checkout/ch_1' } });
  const client = createWhopClient(config({ WHOP_AI_MONTHLY_PLAN_ID: 'plan_m', WHOP_AI_YEARLY_PLAN_ID: 'plan_y' }), { fetch: f });
  const base = { kind: 'ai_plan', userId: USER, amountCents: 1299, successUrl: 'https://app.test/done', reference: 'r' };
  await client.createCheckout({ ...base, interval: 'month' });
  await client.createCheckout({ ...base, interval: 'year' });
  assert.equal(f.requests[0].body.plan_id, 'plan_m');
  assert.equal(f.requests[1].body.plan_id, 'plan_y');
  assert.equal(f.requests[0].body.metadata.interval, 'month');
  assert.equal(f.requests[1].body.metadata.interval, 'year');
  await assert.rejects(() => client.createCheckout({ ...base, interval: null }), BillingError);
});

test('AI plan inline: renewal with the right billing period and price', async () => {
  const f = fakeFetch({ body: { purchase_url: 'https://whop.com/checkout/ch_1' } });
  const client = createWhopClient(config(), { fetch: f });
  await client.createCheckout({ kind: 'ai_plan', interval: 'year', userId: USER, amountCents: 8999, successUrl: 'https://app.test/done', reference: 'r' });
  const plan = f.requests[0].body.plan;
  assert.equal(plan.plan_type, 'renewal');
  assert.equal(plan.billing_period, 365);
  assert.equal(plan.initial_price, 89.99);
  assert.equal(plan.renewal_price, 89.99);
});

test('a coach student checkout is a monthly plan on the coach account with the fee', async () => {
  const f = fakeFetch({ body: { purchase_url: 'https://whop.com/checkout/ch_9' } });
  const client = createWhopClient(config(), { fetch: f });
  await client.createCheckout({
    kind: 'coach_student', interval: null, userId: USER, coachUserId: COACH, linkId: LINK, providerAccountId: 'biz_coach1',
    amountCents: 3000, platformFeePercent: 15, successUrl: 'https://app.test/done', reference: 'link-1',
  });
  const body = f.requests[0].body;
  assert.equal(body.account_id, 'biz_coach1');
  assert.equal(body.plan.company_id, 'biz_coach1');
  assert.equal(body.plan.plan_type, 'renewal');
  assert.equal(body.plan.billing_period, 30);
  assert.equal(body.plan.initial_price, 30);
  assert.equal(body.plan.renewal_price, 30);
  assert.equal(body.plan.application_fee_amount, 4.5);
  assert.deepEqual(body.metadata, { userId: USER, kind: 'coach_student', coachUserId: COACH, linkId: LINK, reference: 'link-1' });
  assert.equal(body.redirect_url, 'https://app.test/done');
});

test('the platform fee is rounded to the cent and stays below the price', async () => {
  const f = fakeFetch({ body: { purchase_url: 'https://whop.com/checkout/ch_9' } });
  const client = createWhopClient(config(), { fetch: f });
  const args = { kind: 'coach_student', userId: USER, coachUserId: COACH, providerAccountId: 'biz_c', successUrl: 'https://app.test/d', reference: 'r' };
  await client.createCheckout({ ...args, amountCents: 1299, platformFeePercent: 15 });
  assert.equal(f.requests[0].body.plan.application_fee_amount, 1.95); // 194.85c -> 195c
  await client.createCheckout({ ...args, amountCents: 1000, platformFeePercent: 10 });
  assert.equal(f.requests[1].body.plan.application_fee_amount, 1);
  await client.createCheckout({ ...args, amountCents: 1000 });
  assert.equal(f.requests[2].body.plan.application_fee_amount, undefined);
  for (const bad of [0, -5, 100, 150, Number.NaN, '15']) {
    await assert.rejects(() => client.createCheckout({ ...args, amountCents: 1000, platformFeePercent: bad }), BillingError, String(bad));
  }
});

test('checkout refuses bad inputs before any request is made', async () => {
  const f = fakeFetch({ body: {} });
  const client = createWhopClient(config(), { fetch: f });
  const ok = { kind: 'coach_student', userId: USER, coachUserId: COACH, providerAccountId: 'biz_c', amountCents: 3000, successUrl: 'https://app.test/d', reference: 'r' };
  await assert.rejects(() => client.createCheckout({ ...ok, kind: 'nope' }), BillingError);
  await assert.rejects(() => client.createCheckout({ ...ok, userId: '' }), BillingError);
  await assert.rejects(() => client.createCheckout({ ...ok, successUrl: 'javascript:alert(1)' }), BillingError);
  await assert.rejects(() => client.createCheckout({ ...ok, amountCents: 12.5 }), BillingError);
  await assert.rejects(() => client.createCheckout({ ...ok, amountCents: 0 }), BillingError);
  await assert.rejects(() => client.createCheckout({ ...ok, providerAccountId: null }), BillingError);
  await assert.rejects(() => client.createCheckout({ ...ok, providerAccountId: '../x' }), BillingError);
  assert.equal(f.requests.length, 0);
});

test('a checkout address that is not Whop-hosted is never returned', async () => {
  for (const url of ['https://evil.example/pay', 'http://whop.com/x', 'https://whop.com.evil.example/x', 'https://user@whop.com/x', undefined, 42]) {
    const f = fakeFetch({ body: { purchase_url: url } });
    const client = createWhopClient(config(), { fetch: f });
    await assert.rejects(
      () => client.createCheckout({ kind: 'ai_plan', interval: 'month', userId: USER, amountCents: 1299, successUrl: 'https://app.test/d', reference: 'r' }),
      BillingError,
      String(url)
    );
  }
});

test('a caller-supplied idempotency key is used; otherwise each call gets its own', async () => {
  const f = fakeFetch({ body: { purchase_url: 'https://whop.com/checkout/ch_9' } });
  const client = createWhopClient(config(), { fetch: f });
  const args = { kind: 'ai_plan', interval: 'month', userId: USER, amountCents: 1299, successUrl: 'https://app.test/d', reference: 'r' };
  await client.createCheckout({ ...args, idempotencyKey: 'my-key-1' });
  await client.createCheckout(args);
  await client.createCheckout(args);
  assert.equal(f.requests[0].headers['Idempotency-Key'], 'my-key-1');
  assert.notEqual(f.requests[1].headers['Idempotency-Key'], f.requests[2].headers['Idempotency-Key']);
});

/* ---------------- onboarding ---------------- */

test('first onboarding creates the account, then the identity-check link', async () => {
  const f = fakeFetch({ body: { id: 'biz_new1' } }, { body: { url: 'https://whop.com/onboard/abc', expires_at: 1 } });
  const result = await createWhopClient(config(), { fetch: f }).createCoachOnboardingLink({
    coachUserId: COACH, providerAccountId: null, returnUrl: 'https://app.test/coach', email: 'coach@example.com', name: 'Aisha Al Balushi',
  });
  assert.deepEqual(result, { url: 'https://whop.com/onboard/abc', providerAccountId: 'biz_new1' });
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].url, 'https://sandbox-api.whop.com/api/v1/accounts');
  assert.equal(f.requests[0].body.email, 'coach@example.com');
  assert.equal(f.requests[0].body.metadata.coachUserId, COACH);
  assert.equal(f.requests[1].url, 'https://sandbox-api.whop.com/api/v1/account_links');
  assert.deepEqual(f.requests[1].body, {
    account_id: 'biz_new1',
    return_url: 'https://app.test/coach',
    refresh_url: 'https://app.test/coach',
    use_case: 'account_onboarding',
  });
});

test('an existing account skips creation', async () => {
  const f = fakeFetch({ body: { url: 'https://whop.com/onboard/abc' } });
  const result = await createWhopClient(config(), { fetch: f }).createCoachOnboardingLink({
    coachUserId: COACH, providerAccountId: 'biz_have', returnUrl: 'https://app.test/coach',
  });
  assert.equal(result.providerAccountId, 'biz_have');
  assert.equal(f.requests.length, 1);
  assert.match(f.requests[0].url, /\/account_links$/);
});

test('onboarding refuses a bad return address or a non-Whop link', async () => {
  const client = createWhopClient(config(), { fetch: fakeFetch({ body: { url: 'https://evil.example/x' } }) });
  await assert.rejects(() => client.createCoachOnboardingLink({ coachUserId: COACH, providerAccountId: 'biz_have', returnUrl: 'https://app.test/c' }), BillingError);
  await assert.rejects(() => client.createCoachOnboardingLink({ coachUserId: COACH, providerAccountId: 'biz_have', returnUrl: 'nonsense' }), BillingError);
});

/* ---------------- cancel ---------------- */

test('cancel asks for the end of the period and reports when it ends', async () => {
  const f = fakeFetch({ body: { id: 'mem_1', cancel_at_period_end: true, current_period_end: '2026-10-31T00:00:00Z' } });
  const result = await createWhopClient(config(), { fetch: f }).cancelSubscription({ providerSubscriptionId: 'mem_1' });
  assert.deepEqual(result, { periodEnd: '2026-10-31T00:00:00.000Z' });
  assert.equal(f.requests[0].method, 'POST');
  assert.equal(f.requests[0].url, 'https://sandbox-api.whop.com/api/v1/memberships/mem_1/cancel');
  assert.deepEqual(f.requests[0].body, { cancel_at_period_end: true });
  assert.ok(f.requests[0].headers['Idempotency-Key']);
});

test('cancel handles unix-second period ends and a missing one', async () => {
  const seconds = Date.UTC(2026, 10, 30) / 1000;
  const a = createWhopClient(config(), { fetch: fakeFetch({ body: { current_period_end: seconds } }) });
  assert.deepEqual(await a.cancelSubscription({ providerSubscriptionId: 'mem_1' }), { periodEnd: '2026-11-30T00:00:00.000Z' });
  const b = createWhopClient(config(), { fetch: fakeFetch({ body: {} }) });
  assert.deepEqual(await b.cancelSubscription({ providerSubscriptionId: 'mem_1' }), { periodEnd: null });
});

test('cancel never builds an address from an unsafe id', async () => {
  const f = fakeFetch({ body: {} });
  const client = createWhopClient(config(), { fetch: f });
  await assert.rejects(() => client.cancelSubscription({ providerSubscriptionId: '../payments/x' }), BillingError);
  await assert.rejects(() => client.cancelSubscription({}), BillingError);
  assert.equal(f.requests.length, 0);
});

/* ---------------- transfers ---------------- */

test('a transfer sends dollars, both ids and the idempotency key twice over', async () => {
  const f = fakeFetch({ body: { id: 'xfer_1', status: 'processing' } });
  const result = await createWhopClient(config(), { fetch: f }).transferToCoach({
    idempotencyKey: 'payout-abc', providerAccountId: 'biz_coach1', amountCents: 2550,
  });
  assert.deepEqual(result, { providerReference: 'xfer_1', status: 'pending' });
  const request = f.requests[0];
  assert.equal(request.url, 'https://sandbox-api.whop.com/api/v1/transfers');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers['Idempotency-Key'], 'payout-abc');
  assert.equal(request.body.idempotence_key, 'payout-abc');
  assert.equal(request.body.origin_id, 'biz_platform');
  assert.equal(request.body.destination_id, 'biz_coach1');
  assert.equal(request.body.amount, 25.5);
  assert.equal(request.body.currency, 'usd');
});

test('transfer statuses map: processing pending, succeeded paid, failed failed, unknown pending', async () => {
  for (const [whop, ours] of [['processing', 'pending'], ['succeeded', 'paid'], ['failed', 'failed'], ['mystery', 'pending'], [undefined, 'pending']]) {
    const f = fakeFetch({ body: { id: 'xfer_1', status: whop } });
    const result = await createWhopClient(config(), { fetch: f }).transferToCoach({ idempotencyKey: 'k', providerAccountId: 'biz_c', amountCents: 100 });
    assert.equal(result.status, ours, String(whop));
  }
});

test('transfers refuse bad amounts, missing keys and missing company id', async () => {
  const f = fakeFetch({ body: { id: 'x', status: 'processing' } });
  const client = createWhopClient(config(), { fetch: f });
  const ok = { idempotencyKey: 'k', providerAccountId: 'biz_c', amountCents: 100 };
  for (const bad of [{ amountCents: 0 }, { amountCents: -1 }, { amountCents: 1.5 }, { amountCents: '100' }, { idempotencyKey: '' }, { providerAccountId: 'a/b' }]) {
    await assert.rejects(() => client.transferToCoach({ ...ok, ...bad }), BillingError, JSON.stringify(bad));
  }
  const noCompany = createWhopClient(billingConfig({ WHOP_API_KEY: 'k', WHOP_WEBHOOK_SECRET: 's' }), { fetch: f });
  await assert.rejects(() => noCompany.transferToCoach(ok), BillingError);
  assert.equal(f.requests.length, 0);
});

test('a transfer answer with no id is an error, never a silent success', async () => {
  const client = createWhopClient(config(), { fetch: fakeFetch({ body: { status: 'succeeded' } }) });
  await assert.rejects(() => client.transferToCoach({ idempotencyKey: 'k', providerAccountId: 'biz_c', amountCents: 100 }), BillingError);
});

test('payout status reads the transfer with a GET and no idempotency key', async () => {
  const f = fakeFetch({ body: { id: 'xfer_1', status: 'succeeded' } });
  const result = await createWhopClient(config(), { fetch: f }).getPayoutStatus({ providerReference: 'xfer_1' });
  assert.deepEqual(result, { status: 'paid' });
  assert.equal(f.requests[0].method, 'GET');
  assert.equal(f.requests[0].url, 'https://sandbox-api.whop.com/api/v1/transfers/xfer_1');
  assert.equal(f.requests[0].headers['Idempotency-Key'], undefined);
  assert.equal(f.requests[0].body, undefined);
});

test('finding a transfer by key: found, not found, and "could not tell" are three different answers', async () => {
  const entry = (id, key) => ({ id, status: 'succeeded', idempotence_key: key, metadata: { payoutId: key } });
  // Found on the second page.
  const f1 = fakeFetch(
    { body: { data: [entry('xfer_a', 'other')], page_info: { has_next_page: true, end_cursor: 'c1' } } },
    { body: { data: [entry('xfer_b', 'mine')], page_info: { has_next_page: false } } }
  );
  const found = await createWhopClient(config(), { fetch: f1 }).findTransferByKey({ idempotencyKey: 'mine', providerAccountId: 'biz_coach1' });
  assert.deepEqual(found, { found: true, providerReference: 'xfer_b', status: 'paid' });
  assert.equal(f1.requests[0].method, 'GET');
  assert.ok(f1.requests[0].url.includes('destination_id=biz_coach1'));
  assert.ok(f1.requests[1].url.includes('after=c1'));

  // Everything read, nothing matches: a trustworthy "not found".
  const f2 = fakeFetch({ body: { data: [entry('xfer_a', 'other')], page_info: { has_next_page: false } } });
  assert.deepEqual(
    await createWhopClient(config(), { fetch: f2 }).findTransferByKey({ idempotencyKey: 'mine', providerAccountId: 'biz_coach1' }),
    { found: false }
  );

  // An error, or entries that do not say which payout they belong to: NOT "not found".
  await assert.rejects(
    () => createWhopClient(config(), { fetch: fakeFetch({ status: 500, body: {} }) }).findTransferByKey({ idempotencyKey: 'mine', providerAccountId: 'biz_coach1' }),
    BillingError
  );
  // A transfer with no key at all (hand-sent or older) is skipped, not an error.
  const keyless = { id: 'xfer_x', status: 'succeeded' };
  const f3 = fakeFetch(
    { body: { data: [keyless], page_info: { has_next_page: true, end_cursor: 'c1' } } },
    { body: { data: [keyless, entry('xfer_m', 'mine')], page_info: { has_next_page: false } } }
  );
  assert.deepEqual(
    await createWhopClient(config(), { fetch: f3 }).findTransferByKey({ idempotencyKey: 'mine', providerAccountId: 'biz_coach1' }),
    { found: true, providerReference: 'xfer_m', status: 'paid' }
  );
  // Fully read, only keyless entries: the list never proved it echoes keys, so
  // this is "cannot tell" (money stays held), NOT "not found".
  const f4 = fakeFetch({ body: { data: [keyless], page_info: { has_next_page: false } } });
  await assert.rejects(
    () => createWhopClient(config(), { fetch: f4 }).findTransferByKey({ idempotencyKey: 'mine', providerAccountId: 'biz_coach1' }),
    BillingError
  );
  // Mixed list: another entry carried a key (proof keys are echoed). A keyless
  // entry whose time we cannot read could be ours: cannot tell.
  const f4b = fakeFetch({ body: { data: [keyless, entry('xfer_a', 'other')], page_info: { has_next_page: false } } });
  await assert.rejects(
    () => createWhopClient(config(), { fetch: f4b }).findTransferByKey({ idempotencyKey: 'mine', providerAccountId: 'biz_coach1' }),
    (err) => err instanceof BillingError && err.possibleMatch === true
  );
  // A keyless entry that looks like ours by note: cannot tell.
  const byNote = { id: 'xfer_n', status: 'succeeded', notes: 'Cut coach payout' };
  const f4c = fakeFetch({ body: { data: [byNote, entry('xfer_a', 'other')], page_info: { has_next_page: false } } });
  await assert.rejects(
    () => createWhopClient(config(), { fetch: f4c }).findTransferByKey({ idempotencyKey: 'mine', providerAccountId: 'biz_coach1' }),
    BillingError
  );
  // A keyless entry within 24 hours of the payout counts, even with a different amount and note.
  const near = { id: 'xfer_m2', status: 'succeeded', amount: 99.99, notes: 'something else', created_at: '2026-10-01T10:00:00Z' };
  const f4d = fakeFetch({ body: { data: [near, entry('xfer_a', 'other')], page_info: { has_next_page: false } } });
  await assert.rejects(
    () => createWhopClient(config(), { fetch: f4d }).findTransferByKey({
      idempotencyKey: 'mine', providerAccountId: 'biz_coach1', amountCents: 1250, createdAt: '2026-10-01T09:00:00Z',
    }),
    (err) => err instanceof BillingError && err.possibleMatch === true
  );
  // A keyless entry more than 24 hours away is ignored.
  const f4e = fakeFetch({ body: { data: [near, entry('xfer_a', 'other')], page_info: { has_next_page: false } } });
  assert.deepEqual(
    await createWhopClient(config(), { fetch: f4e }).findTransferByKey({
      idempotencyKey: 'mine', providerAccountId: 'biz_coach1', amountCents: 1250, createdAt: '2026-08-01T09:00:00Z',
    }),
    { found: false }
  );
  // The time is read like the rest of the file: unix seconds and milliseconds
  // both work, and a missing or unreadable time is "could be ours", not 1970.
  const nearMs = Date.parse('2026-10-01T10:00:00Z');
  const asEntry = (created_at) => ({ id: 'xfer_t', status: 'succeeded', created_at });
  const lookWith = (created_at, createdAt = '2026-10-01T09:00:00Z') => createWhopClient(config(), {
    fetch: fakeFetch({ body: { data: [asEntry(created_at), entry('xfer_a', 'other')], page_info: { has_next_page: false } } }),
  }).findTransferByKey({ idempotencyKey: 'mine', providerAccountId: 'biz_coach1', createdAt });
  const possible = (err) => err instanceof BillingError && err.possibleMatch === true;
  await assert.rejects(() => lookWith(null), possible);
  await assert.rejects(() => lookWith(undefined), possible);
  await assert.rejects(() => lookWith('not a date'), possible);
  await assert.rejects(() => lookWith(Math.floor(nearMs / 1000)), possible); // seconds, near
  await assert.rejects(() => lookWith(nearMs), possible); // milliseconds, near
  // Seconds, far away (more than 24 hours), with a keyed entry present: ignored.
  assert.deepEqual(await lookWith(Math.floor(Date.parse('2026-08-01T09:00:00Z') / 1000)), { found: false });
  assert.deepEqual(await lookWith(Date.parse('2026-08-01T09:00:00Z')), { found: false });
  // A near keyless entry on a LATER page is still seen (every page is read).
  const f4g = fakeFetch(
    { body: { data: [entry('xfer_a', 'other')], page_info: { has_next_page: true, end_cursor: 'c1' } } },
    { body: { data: [near], page_info: { has_next_page: false } } }
  );
  await assert.rejects(
    () => createWhopClient(config(), { fetch: f4g }).findTransferByKey({
      idempotencyKey: 'mine', providerAccountId: 'biz_coach1', createdAt: '2026-10-01T09:00:00Z',
    }),
    (err) => err.possibleMatch === true
  );
  // An empty, fully read list is a trusted "not found".
  const f4f = fakeFetch({ body: { data: [], page_info: { has_next_page: false } } });
  assert.deepEqual(
    await createWhopClient(config(), { fetch: f4f }).findTransferByKey({ idempotencyKey: 'mine', providerAccountId: 'biz_coach1' }),
    { found: false }
  );
  // Not found AND the list was cut off (no cursor to continue): NOT "not found".
  const f5 = fakeFetch({ body: { data: [keyless], page_info: { has_next_page: true } } });
  await assert.rejects(
    () => createWhopClient(config(), { fetch: f5 }).findTransferByKey({ idempotencyKey: 'mine', providerAccountId: 'biz_coach1' }),
    BillingError
  );
});

test('refunding a payment posts a full refund with a stable key', async () => {
  const f = fakeFetch({ body: { id: 'rf_1' } });
  const result = await createWhopClient(config(), { fetch: f }).refundPayment({ providerPaymentId: 'pay_1' });
  assert.deepEqual(result, { refunded: true });
  assert.equal(f.requests[0].method, 'POST');
  assert.equal(f.requests[0].url, 'https://sandbox-api.whop.com/api/v1/payments/pay_1/refund');
  assert.equal(f.requests[0].headers['Idempotency-Key'], 'auto-refund-pay_1');
});

/* ---------------- errors ---------------- */

test('errors are plain, carry the status, and never contain the key or the provider text', async () => {
  const secretish = { error: { type: 'bad_request', code: 'bad_thing', message: `echo of ${API_KEY} and card 4242` } };
  for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) {
    const client = createWhopClient(config(), { fetch: fakeFetch({ status, body: secretish }) });
    await assert.rejects(
      () => client.refundPayment({ providerPaymentId: 'pay_1', idempotencyKey: 'k_1' }),
      (error) => {
        assert.ok(error instanceof BillingError);
        assert.equal(error.status, status);
        assert.equal(error.outcomeUnknown, status >= 500 || status === 409);
        assert.ok(!error.message.includes(API_KEY));
        assert.ok(!error.message.includes('4242'));
        assert.ok(!JSON.stringify(error).includes(API_KEY));
        assert.ok(!String(error.stack).includes(API_KEY));
        return true;
      },
      String(status)
    );
  }
});

test('cancelling a subscription the provider no longer has says alreadyGone; other errors still throw', async () => {
  const gone = createWhopClient(config(), { fetch: fakeFetch({ status: 404, body: {} }) });
  assert.deepEqual(await gone.cancelSubscription({ providerSubscriptionId: 'mem_1' }), { alreadyGone: true });
  const broken = createWhopClient(config(), { fetch: fakeFetch({ status: 500, body: {} }) });
  await assert.rejects(() => broken.cancelSubscription({ providerSubscriptionId: 'mem_1' }));
});

test('a provider error code is kept for the caller, trimmed', async () => {
  const client = createWhopClient(config(), { fetch: fakeFetch({ status: 400, body: { error: { code: 'invalid_amount' } } }) });
  await assert.rejects(
    () => client.cancelSubscription({ providerSubscriptionId: 'mem_1' }),
    (error) => error.providerCode === 'invalid_amount'
  );
});

test('a dropped connection on a write says the outcome is unknown; on a read it does not', async () => {
  const down = new Error(`connect failed with ${API_KEY}`);
  const client = createWhopClient(config(), { fetch: fakeFetch(down) });
  await assert.rejects(
    () => client.transferToCoach({ idempotencyKey: 'k', providerAccountId: 'biz_c', amountCents: 100 }),
    (error) => error instanceof BillingError && error.outcomeUnknown === true && !error.message.includes(API_KEY)
  );
  await assert.rejects(
    () => client.getPayoutStatus({ providerReference: 'x1' }),
    (error) => error instanceof BillingError && error.outcomeUnknown === false
  );
});

test('an unreadable success answer reads as empty, not a crash', async () => {
  const client = createWhopClient(config(), { fetch: fakeFetch({ badJson: true }) });
  assert.deepEqual(await client.cancelSubscription({ providerSubscriptionId: 'mem_1' }), { periodEnd: null });
});
