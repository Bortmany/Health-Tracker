// Settings, the dormant state, the health summary (never leaks secrets), the
// injectable client, and the fake client. No database, no network.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  billingConfig,
  isBillingEnabled,
  isPayoutsEnabled,
  payoutMethod,
  healthSummary,
  getBillingClient,
  setBillingClient,
  BillingError,
} from './index.js';
import { createFakeBillingClient } from './fake.js';

afterEach(() => setBillingClient(null));

const FULL = {
  WHOP_API_KEY: 'whop_key_SUPERSECRET',
  WHOP_WEBHOOK_SECRET: 'ws_SUPERSECRET',
  WHOP_COMPANY_ID: 'biz_platform',
  WHOP_STARTUP_FEE_PLAN_ID: 'plan_fee',
  WHOP_AI_MONTHLY_PLAN_ID: 'plan_m',
  WHOP_AI_YEARLY_PLAN_ID: 'plan_y',
  APP_URL: 'https://cut.example.com/',
};

test('with nothing set, billing is dormant', () => {
  assert.equal(billingConfig({}), null);
  assert.equal(isBillingEnabled({}), false);
  assert.equal(isPayoutsEnabled({}), false);
});

test('the key and the webhook secret are both needed', () => {
  assert.equal(billingConfig({ WHOP_API_KEY: 'k' }), null);
  assert.equal(billingConfig({ WHOP_WEBHOOK_SECRET: 's' }), null);
  assert.equal(billingConfig({ WHOP_API_KEY: '  ', WHOP_WEBHOOK_SECRET: 's' }), null);
  assert.notEqual(billingConfig({ WHOP_API_KEY: 'k', WHOP_WEBHOOK_SECRET: 's' }), null);
});

test('a full configuration reads every setting', () => {
  assert.deepEqual(billingConfig(FULL), {
    provider: 'whop',
    apiKey: 'whop_key_SUPERSECRET',
    webhookSecret: 'ws_SUPERSECRET',
    companyId: 'biz_platform',
    environment: 'sandbox',
    appUrl: 'https://cut.example.com',
    plans: { startupFee: 'plan_fee', aiMonthly: 'plan_m', aiYearly: 'plan_y' },
  });
});

test('sandbox unless WHOP_ENV is exactly live', () => {
  assert.equal(billingConfig({ ...FULL, WHOP_ENV: 'live' }).environment, 'live');
  assert.equal(billingConfig({ ...FULL, WHOP_ENV: ' LIVE ' }).environment, 'live');
  for (const value of ['', 'sandbox', 'prod', 'production', 'true']) {
    assert.equal(billingConfig({ ...FULL, WHOP_ENV: value }).environment, 'sandbox', value);
  }
});

test('missing optional settings are null and the app address has a safe default', () => {
  const config = billingConfig({ WHOP_API_KEY: 'k', WHOP_WEBHOOK_SECRET: 's' });
  assert.equal(config.companyId, null);
  assert.deepEqual(config.plans, { startupFee: null, aiMonthly: null, aiYearly: null });
  assert.equal(config.appUrl, 'http://localhost:5173');
  assert.equal(billingConfig({ ...FULL, APP_URL: 'javascript:alert(1)' }).appUrl, 'http://localhost:5173');
});

test('MONEY_PROVIDER picks the driver; one with no driver is dormant', () => {
  assert.equal(billingConfig({ ...FULL, MONEY_PROVIDER: 'whop' }).provider, 'whop');
  assert.equal(billingConfig({ ...FULL, MONEY_PROVIDER: 'paypal' }), null);
  assert.equal(healthSummary({ ...FULL, MONEY_PROVIDER: 'paypal' }).billing.state, 'dormant');
  assert.equal(healthSummary({ ...FULL, MONEY_PROVIDER: 'paypal' }).billing.provider, 'paypal');
});

test('payout method is A or B only; payouts need billing on as well', () => {
  assert.equal(payoutMethod({}), null);
  assert.equal(payoutMethod({ PAYOUT_METHOD: 'a' }), 'A');
  assert.equal(payoutMethod({ PAYOUT_METHOD: 'B' }), 'B');
  assert.equal(payoutMethod({ PAYOUT_METHOD: 'C' }), null);
  assert.equal(isPayoutsEnabled({ PAYOUT_METHOD: 'A' }), false);
  assert.equal(isPayoutsEnabled({ ...FULL }), false);
  assert.equal(isPayoutsEnabled({ ...FULL, PAYOUT_METHOD: 'B' }), true);
});

test('health says dormant with nothing set', () => {
  assert.deepEqual(healthSummary({}), {
    billing: { state: 'dormant', provider: 'whop', environment: 'sandbox' },
    payouts: { state: 'dormant', method: null },
    email: { state: 'dormant' },
  });
});

test('health says configured when set, and never contains a key or secret', () => {
  const env = { ...FULL, WHOP_ENV: 'live', PAYOUT_METHOD: 'A', RESEND_API_KEY: 're_SUPERSECRET', EMAIL_FROM: 'Cut <hi@cut.example.com>' };
  const summary = healthSummary(env);
  assert.deepEqual(summary, {
    billing: { state: 'configured', provider: 'whop', environment: 'live' },
    payouts: { state: 'configured', method: 'A' },
    email: { state: 'configured' },
  });
  const text = JSON.stringify(summary);
  for (const secret of ['SUPERSECRET', 'biz_platform', 'plan_fee', 're_', 'cut.example.com']) {
    assert.ok(!text.includes(secret), secret);
  }
});

test('the client is refused while dormant, with a plain message', () => {
  const saved = { ...process.env };
  delete process.env.WHOP_API_KEY;
  delete process.env.WHOP_WEBHOOK_SECRET;
  try {
    assert.throws(() => getBillingClient(), (error) => error instanceof BillingError && /not switched on/i.test(error.message));
  } finally {
    Object.assign(process.env, saved);
  }
});

test('a client can be injected and removed', () => {
  const fake = createFakeBillingClient();
  setBillingClient(fake);
  assert.equal(getBillingClient(), fake);
  setBillingClient(null);
  const saved = process.env.WHOP_API_KEY;
  delete process.env.WHOP_API_KEY;
  try {
    assert.throws(() => getBillingClient(), BillingError);
  } finally {
    if (saved !== undefined) process.env.WHOP_API_KEY = saved;
  }
});

test('the fake client records every call and answers predictably', async () => {
  const fake = createFakeBillingClient();
  const checkout = await fake.createCheckout({ kind: 'ai_plan', userId: 'u1', reference: 'r1' });
  assert.equal(checkout.url, 'https://sandbox.whop.com/checkout/fake-r1');
  const onboarding = await fake.createCoachOnboardingLink({ coachUserId: 'c1', providerAccountId: null, returnUrl: 'x' });
  assert.equal(onboarding.providerAccountId, 'biz_fake_c1');
  assert.deepEqual(await fake.cancelSubscription({ providerSubscriptionId: 'mem_1' }), { periodEnd: '2030-01-31T00:00:00.000Z' });
  const first = await fake.transferToCoach({ idempotencyKey: 'p1', providerAccountId: 'biz_c', amountCents: 100 });
  const again = await fake.transferToCoach({ idempotencyKey: 'p1', providerAccountId: 'biz_c', amountCents: 100 });
  assert.deepEqual(first, again);
  assert.equal(first.status, 'paid');
  assert.deepEqual(fake.calls.map((c) => c.method), ['createCheckout', 'createCoachOnboardingLink', 'cancelSubscription', 'transferToCoach', 'transferToCoach']);
  assert.equal(fake.calls[3].args.amountCents, 100);
});

test('the fake client can fail on chosen methods, still recording the call', async () => {
  const fake = createFakeBillingClient({ failOn: ['transferToCoach'], transferStatus: 'pending' });
  await assert.rejects(() => fake.transferToCoach({ idempotencyKey: 'p1' }), BillingError);
  assert.equal(fake.calls.length, 1);
  assert.equal((await fake.getPayoutStatus({ providerReference: 'x' })).status, 'pending');
  await assert.rejects(() => createFakeBillingClient({ failOn: 'createCheckout' }).createCheckout({}), BillingError);
});
