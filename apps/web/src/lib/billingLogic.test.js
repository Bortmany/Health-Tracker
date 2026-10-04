import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  billingErrorMessage,
  cancelMessage,
  getPaidSteps,
  normalizeAdminEarnings,
  normalizeCoachBilling,
  normalizePendingPayment,
  normalizeStatus,
  normalizeSubscriptions,
  owedTone,
  passwordResetError,
  payButtonState,
  payoutPill,
  priceFigure,
  safeCheckoutUrl,
  showAiPicker,
  statusChip,
  statusSentence,
  subscriptionState,
} from './billingLogic.js';
import * as copy from './billingCopy.js';

test('only real https addresses are followed', () => {
  assert.equal(safeCheckoutUrl('https://whop.com/checkout/abc'), 'https://whop.com/checkout/abc');
  assert.equal(safeCheckoutUrl('http://whop.com/x'), null);
  assert.equal(safeCheckoutUrl('javascript:alert(1)'), null);
  assert.equal(safeCheckoutUrl('//evil.com'), null);
  assert.equal(safeCheckoutUrl('data:text/html,hi'), null);
  assert.equal(safeCheckoutUrl(''), null);
  assert.equal(safeCheckoutUrl(undefined), null);
  assert.equal(safeCheckoutUrl({}), null);
});

test('the money switch is off unless the server says exactly true', () => {
  assert.equal(normalizeStatus(undefined).configured, false);
  assert.equal(normalizeStatus({}).configured, false);
  assert.equal(normalizeStatus({ configured: 'true' }).configured, false);
  assert.equal(normalizeStatus({ configured: true }).configured, true);
  const s = normalizeStatus({ configured: true, payouts: { configured: true, method: 'B' }, email: { configured: true } });
  assert.deepEqual([s.payoutsConfigured, s.payoutMethod, s.emailConfigured], [true, 'B', true]);
  assert.equal(normalizeStatus({ payouts: { method: 'Z' } }).payoutMethod, null);
  assert.equal(normalizeStatus({ aiPlanEnabled: false }).aiPlanEnabled, false);
  assert.equal(normalizeStatus({ planTier: 'premium' }).planTier, 'premium');
});

test('known error codes get plain words; unknown ones get the fallback', () => {
  assert.equal(billingErrorMessage({ code: 'BILLING_DISABLED' }, 'x'), copy.serverErrors.BILLING_DISABLED);
  assert.equal(billingErrorMessage({ code: 'PRICE_TOO_LOW' }, 'x'), copy.getPaid.priceErrors.low);
  assert.equal(billingErrorMessage({ status: 429 }, 'x'), copy.serverErrors.RATE_LIMITED);
  assert.equal(billingErrorMessage({ code: 'WHAT' }, 'fallback'), 'fallback');
  assert.equal(billingErrorMessage(null, 'fallback'), 'fallback');
});

test('the Get paid steps follow the fee, then the identity check', () => {
  assert.deepEqual(getPaidSteps(normalizeCoachBilling({})), { step1: false, step2: false, step3: false, current: 1 });
  assert.equal(getPaidSteps({ startupFeePaidOn: '2026-10-03' }).current, 2);
  assert.equal(getPaidSteps({ startupFeePaidOn: '2026-10-03', identityVerified: true }).current, 3);
  assert.equal(
    getPaidSteps({ startupFeePaidOn: '2026-10-03', identityVerified: true, active: true }).current,
    null
  );
});

test('coach billing tolerates missing fields', () => {
  const b = normalizeCoachBilling({ priceCents: 'x', payingStudents: undefined });
  assert.equal(b.priceCents, null);
  assert.equal(b.payingStudents, 0);
  assert.equal(b.minPriceCents, 1000);
  assert.equal(b.maxPriceCents, 50000);
});

test('payout pill words and tones', () => {
  assert.deepEqual(payoutPill('paid'), { label: 'Paid', tone: 'accent' });
  assert.deepEqual(payoutPill('failed'), { label: 'Failed', tone: 'warn' });
  assert.deepEqual(payoutPill('pending'), { label: 'Pending', tone: 'warn' });
  assert.deepEqual(payoutPill('???'), { label: 'Pending', tone: 'warn' });
});

const AI = {
  id: 'a1',
  kind: 'ai_yearly',
  coach: null,
  priceCents: 8999,
  interval: 'year',
  status: 'active',
  cancelAtPeriodEnd: false,
  startedOn: '2026-10-14',
  periodEnd: '2026-11-14',
};

test('subscriptions: bare array or wrapped, junk skipped', () => {
  assert.equal(normalizeSubscriptions([AI, null, { nope: 1 }]).length, 1);
  assert.equal(normalizeSubscriptions({ subscriptions: [AI] }).length, 1);
  assert.deepEqual(normalizeSubscriptions(undefined), []);
});

test('subscription states, pills and sentences', () => {
  const [active] = normalizeSubscriptions([AI]);
  assert.equal(subscriptionState(active), 'active');
  assert.equal(statusChip(active).label, 'Active');
  assert.equal(statusSentence(active), 'Renews automatically.');
  const [ending] = normalizeSubscriptions([{ ...AI, cancelAtPeriodEnd: true }]);
  assert.equal(subscriptionState(ending), 'ending');
  assert.match(statusChip(ending).label, /^Ends .*14/);
  assert.match(statusSentence(ending), /^Cancelled\. You keep access until .*2026\.$/);
  const [issue] = normalizeSubscriptions([{ ...AI, status: 'past_due' }]);
  assert.equal(statusChip(issue).label, 'Payment issue');
  const [ended] = normalizeSubscriptions([{ ...AI, status: 'ended' }]);
  assert.equal(statusChip(ended).tone, 'neutral');
});

test('a bad end date never shows NaN', () => {
  const [ending] = normalizeSubscriptions([{ ...AI, cancelAtPeriodEnd: true, periodEnd: 'garbage' }]);
  assert.equal(statusChip(ending).label, 'Ends —');
  assert.ok(!cancelMessage(ending).includes('NaN'));
});

test('yearly price shows a per-month note; monthly does not', () => {
  const [yearly] = normalizeSubscriptions([AI]);
  assert.deepEqual(priceFigure(yearly), { cents: 8999, per: 'a year', note: '($7.50 a month)' });
  const [monthly] = normalizeSubscriptions([{ ...AI, interval: 'month', priceCents: 1299 }]);
  assert.equal(priceFigure(monthly).note, null);
  const [noPrice] = normalizeSubscriptions([{ ...AI, priceCents: null }]);
  assert.equal(priceFigure(noPrice).note, null);
});

test('cancel wording differs for AI and coach subscriptions', () => {
  const [ai] = normalizeSubscriptions([AI]);
  assert.match(cancelMessage(ai), /^Cancel your AI plan\?/);
  const [coach] = normalizeSubscriptions([{ ...AI, kind: 'coach', coach: { id: 'c1', displayName: 'Sara A.' } }]);
  assert.match(cancelMessage(coach), /^Cancel training with Sara A\./);
  assert.match(cancelMessage(coach), /Sara A\. will be told\.$/);
});

test('the AI plan picker is only for people without an AI plan', () => {
  const [ai] = normalizeSubscriptions([AI]);
  const [coach] = normalizeSubscriptions([{ ...AI, kind: 'coach', coach: { id: 'c1', displayName: 'S' } }]);
  const [ended] = normalizeSubscriptions([{ ...AI, status: 'ended' }]);
  assert.equal(showAiPicker([], 'free'), true);
  assert.equal(showAiPicker([coach], 'free'), true);
  assert.equal(showAiPicker([ended], 'free'), true);
  assert.equal(showAiPicker([ai], 'free'), false);
  assert.equal(showAiPicker([], 'premium'), false);
});

test('pending payment is read from either shape and needs a coach', () => {
  assert.equal(normalizePendingPayment({}), null);
  assert.equal(normalizePendingPayment({ pendingPayment: { priceCents: 3000 } }), null);
  const p = normalizePendingPayment({ pendingPayment: { coach: { id: 'c1', displayName: 'Sara A.' }, priceCents: 3000 } });
  assert.deepEqual(p, { coach: { id: 'c1', displayName: 'Sara A.' }, priceCents: 3000, requestId: null });
  assert.equal(
    normalizePendingPayment({ pendingPayment: { coach: { id: 'c1' }, priceCents: 3000 }, pendingRequest: { id: 'r9' } }).requestId,
    'r9'
  );
  assert.equal(
    normalizePendingPayment({ link: { pendingPayment: { coach: { id: 'c1' }, priceCents: 'x' } } }).priceCents,
    null
  );
});

test('admin figures are whole cents with safe defaults', () => {
  const e = normalizeAdminEarnings({
    totalOwedCents: 41250,
    payableCents: 39800,
    payableCoachCount: 5,
    skippedCoachCount: 1,
    coaches: [{ userId: 'u1', displayName: 'Sara', owedCents: -1200, paidCents: 5, revoked: true }, null],
    negativeBalances: [{ userId: 'u1', displayName: 'Sara', owedCents: -1200 }, { userId: 'u2', owedCents: 5 }],
  });
  assert.equal(e.coaches.length, 1);
  assert.equal(e.coaches[0].revoked, true);
  assert.equal(e.negativeBalances.length, 1);
  const empty = normalizeAdminEarnings(undefined);
  assert.equal(empty.totalOwedCents, 0);
  assert.deepEqual(empty.coaches, []);
});

test('the Pay coaches now button states', () => {
  const on = normalizeStatus({ configured: true, payouts: { configured: true, method: 'B' } });
  const ready = normalizeAdminEarnings({ payableCents: 100, payableCoachCount: 1 });
  assert.equal(payButtonState(on, ready), 'ready');
  assert.equal(payButtonState(on, normalizeAdminEarnings({})), 'nothing');
  assert.equal(payButtonState(on, undefined), 'nothing');
  assert.equal(payButtonState(normalizeStatus({}), ready), 'off');
  assert.equal(payButtonState(normalizeStatus({ configured: true, payouts: { configured: false } }), ready), 'off');
  const a = normalizeStatus({ configured: true, payouts: { configured: true, method: 'A' } });
  assert.equal(payButtonState(a, ready), 'methodA');
});

test('owed figure tone', () => {
  assert.equal(owedTone(8400), 'accent');
  assert.equal(owedTone(-1200), 'warn');
  assert.equal(owedTone(0), 'plain');
  assert.equal(owedTone(null), 'plain');
});

test('wording that quotes prices follows the one pricing file', () => {
  assert.equal(copy.getPaid.step1Button, 'Pay $49');
  assert.equal(copy.pricing.cutLines[2], 'The rest goes to the coach. Example: a $30 plan pays the coach $25.50 and Cut $4.50.');
  assert.equal(copy.getPaid.keepLine(3000, 15), "You'd keep $25.50 of every $30 payment (we take 15%).");
  assert.match(copy.getPaid.keepLine(3000, 10), /we take 10% because you coach 20\+ paying students/);
  assert.equal(copy.getPaid.keepLine(null, 15), null);
  assert.equal(copy.student.payButton(3000, 'Sara'), 'Pay $30/month to start with Sara');
  assert.equal(copy.subscription.subscribeYearly, 'Subscribe, $89.99 a year');
  assert.equal(copy.admin.confirmSend(39800, 5, 1), "Send $398.00 to 5 coaches now? Money moves to their accounts and can't be taken back. 1 coach isn't included (identity check not finished).");
});

test("passwordResetError checks length first, then the match", () => {
  assert.equal(passwordResetError("short", "short"), "short");
  assert.equal(passwordResetError(undefined, ""), "short");
  assert.equal(passwordResetError("longenough1", "different1"), "mismatch");
  assert.equal(passwordResetError("longenough1", "longenough1"), null);
});
