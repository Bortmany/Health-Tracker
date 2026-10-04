// Plain logic behind the money screens (no React), so it can be tested.
// Everything here treats server data defensively: a missing or odd field
// becomes a safe default, never "undefined" or NaN on screen.
import { common, pills, serverErrors, subscription } from './billingCopy.js';
import { formatDay, formatDayShort } from './money.js';

// ---- Redirects ----

// A checkout/onboarding address is only followed when it's a real https URL.
// Returns the clean URL string or null.
export function safeCheckoutUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

// ---- The switch (GET /api/billing/status) ----

// Anything other than an explicit `true` counts as OFF. A failed status call
// therefore leaves every money button on "Coming soon".
export function normalizeStatus(raw) {
  const method = raw?.payouts?.method;
  return {
    configured: raw?.configured === true,
    payoutsConfigured: raw?.payouts?.configured === true,
    payoutMethod: method === 'A' || method === 'B' ? method : null,
    emailConfigured: raw?.email?.configured === true,
    planTier: raw?.planTier === 'premium' ? 'premium' : 'free',
    // Only an explicit false switches the AI plan off.
    aiPlanEnabled: raw?.aiPlanEnabled !== false,
  };
}

// ---- Error words ----

// The server's plain message when there is one, but known codes get our own
// wording (so the sentence stays consistent everywhere).
export function billingErrorMessage(error, fallback) {
  const code = error?.code;
  if (code && serverErrors[code]) return serverErrors[code];
  if (error?.status === 429) return serverErrors.RATE_LIMITED;
  return fallback;
}

// ---- Coach: Get paid ----

// What the coach billing card shows from GET /api/coach/billing.
export function normalizeCoachBilling(raw) {
  const int = (v) => (Number.isInteger(v) ? v : null);
  return {
    startupFeePaidOn: typeof raw?.startupFeePaidOn === 'string' ? raw.startupFeePaidOn : null,
    identityVerified: raw?.identityVerified === true,
    active: raw?.active === true,
    revoked: raw?.revoked === true,
    priceCents: int(raw?.priceCents),
    minPriceCents: int(raw?.minPriceCents) ?? 1000,
    maxPriceCents: int(raw?.maxPriceCents) ?? 50000,
    payingStudents: int(raw?.payingStudents) ?? 0,
    ratePercent: int(raw?.ratePercent),
  };
}

// Which of the three steps are done, and which is the current one (1, 2, 3 or
// null when everything is finished).
export function getPaidSteps(billing) {
  const step1 = Boolean(billing?.startupFeePaidOn);
  const step2 = billing?.identityVerified === true;
  const step3 = billing?.active === true;
  let current = null;
  if (!step1) current = 1;
  else if (!step2) current = 2;
  else if (!step3) current = 3;
  return { step1, step2, step3, current };
}

// ---- Payout / subscription pills ----

export function payoutPill(status) {
  if (status === 'paid') return { label: pills.paid, tone: 'accent' };
  if (status === 'failed') return { label: pills.failed, tone: 'warn' };
  if (status === 'manual_review') return { label: pills.manualReview, tone: 'warn' };
  return { label: pills.pending, tone: 'warn' };
}

// ---- Subscriptions ----

const KINDS = ['ai_monthly', 'ai_yearly', 'coach'];

export function normalizeSubscriptions(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.subscriptions) ? data.subscriptions : [];
  return list
    .filter((s) => s && typeof s === 'object' && typeof s.id === 'string' && s.id)
    .map((s) => ({
      id: s.id,
      kind: KINDS.includes(s.kind) ? s.kind : s.coach ? 'coach' : 'ai_monthly',
      coachName: typeof s.coach?.displayName === 'string' && s.coach.displayName ? s.coach.displayName : null,
      priceCents: Number.isInteger(s.priceCents) ? s.priceCents : null,
      interval: s.interval === 'year' ? 'year' : 'month',
      status: s.status === 'past_due' || s.status === 'ended' ? s.status : 'active',
      cancelAtPeriodEnd: s.cancelAtPeriodEnd === true,
      startedOn: s.startedOn ?? null,
      periodEnd: s.periodEnd ?? null,
    }));
}

// 'active' | 'ending' | 'issue' | 'ended'
export function subscriptionState(sub) {
  if (sub.status === 'ended') return 'ended';
  if (sub.status === 'past_due') return 'issue';
  if (sub.cancelAtPeriodEnd) return 'ending';
  return 'active';
}

export function isAiSubscription(sub) {
  return sub.kind === 'ai_monthly' || sub.kind === 'ai_yearly';
}

export function statusChip(sub) {
  switch (subscriptionState(sub)) {
    case 'ending':
      return { label: pills.endsOn(formatDayShort(sub.periodEnd)), tone: 'warn' };
    case 'issue':
      return { label: pills.paymentIssue, tone: 'warn' };
    case 'ended':
      return { label: pills.ended, tone: 'neutral' };
    default:
      return { label: pills.active, tone: 'accent' };
  }
}

export function statusSentence(sub) {
  switch (subscriptionState(sub)) {
    case 'ending':
      return subscription.statusCancelled(formatDay(sub.periodEnd));
    case 'issue':
      return subscription.statusIssue;
    case 'ended':
      return subscription.statusEnded;
    default:
      return subscription.statusActive;
  }
}

export function subscriptionTitle(sub) {
  return sub.kind === 'coach'
    ? subscription.coachTitle(sub.coachName ?? 'your coach')
    : subscription.aiTitle;
}

// The price block: { cents, per, note } where note is the yearly "per month".
export function priceFigure(sub) {
  const yearly = sub.interval === 'year';
  const note =
    yearly && Number.isInteger(sub.priceCents) ? subscription.yearlyPerMonthNote(Math.round(sub.priceCents / 12)) : null;
  return { cents: sub.priceCents, per: yearly ? subscription.perYear : subscription.perMonth, note };
}

export function cancelMessage(sub) {
  const day = formatDay(sub.periodEnd);
  return sub.kind === 'coach'
    ? subscription.cancelCoach(sub.coachName ?? 'your coach', day)
    : subscription.cancelAi(day);
}

// Whether the picker for the AI plan should be offered: nobody who already
// has an AI plan (running or ending) or the premium tier gets it.
export function showAiPicker(subs, planTier) {
  if (planTier === 'premium') return false;
  return !subs.some((s) => isAiSubscription(s) && s.status !== 'ended');
}

// ---- Student pay step ----

export function normalizePendingPayment(raw) {
  const p = raw?.pendingPayment ?? raw?.link?.pendingPayment ?? null;
  if (!p || typeof p !== 'object') return null;
  const id = typeof p.coach?.id === 'string' || typeof p.coach?.id === 'number' ? p.coach.id : null;
  if (id == null) return null;
  return {
    coach: {
      id,
      displayName: typeof p.coach?.displayName === 'string' && p.coach.displayName ? p.coach.displayName : null,
    },
    priceCents: Number.isInteger(p.priceCents) ? p.priceCents : null,
    // Which request this payment belongs to, if the server says (for "Cancel request").
    requestId: p.requestId ?? raw?.pendingRequest?.id ?? null,
  };
}

// ---- Admin: payouts ----

export function normalizeAdminEarnings(raw) {
  const int = (v) => (Number.isInteger(v) ? v : 0);
  const coaches = (Array.isArray(raw?.coaches) ? raw.coaches : [])
    .filter((c) => c && typeof c.userId !== 'undefined')
    .map((c) => ({
      userId: c.userId,
      displayName: typeof c.displayName === 'string' ? c.displayName : '—',
      email: typeof c.email === 'string' ? c.email : '',
      revoked: c.revoked === true,
      identityVerified: c.identityVerified === true,
      owedCents: Number.isInteger(c.owedCents) ? c.owedCents : null,
      paidCents: Number.isInteger(c.paidCents) ? c.paidCents : null,
      beingCheckedCents: Number.isInteger(c.beingCheckedCents) ? c.beingCheckedCents : 0,
    }));
  const negativeBalances = (Array.isArray(raw?.negativeBalances) ? raw.negativeBalances : [])
    .filter((c) => c && Number.isInteger(c.owedCents) && c.owedCents < 0)
    .map((c) => ({
      userId: c.userId,
      displayName: typeof c.displayName === 'string' ? c.displayName : '—',
      owedCents: c.owedCents,
    }));
  // Plain-English sentences from the server about money that needs the owner.
  const needsAttention = (Array.isArray(raw?.needsAttention) ? raw.needsAttention : [])
    .filter((n) => n && typeof n.message === 'string' && n.message.length > 0)
    .map((n, i) => ({ id: String(n.id ?? i), message: n.message }));
  return {
    needsAttention,
    totalOwedCents: int(raw?.totalOwedCents),
    payableCents: int(raw?.payableCents),
    payableCoachCount: int(raw?.payableCoachCount),
    skippedCoachCount: int(raw?.skippedCoachCount),
    coaches,
    negativeBalances,
  };
}

// Which state the "Pay coaches now" button is in.
// 'off' | 'methodA' | 'nothing' | 'ready'
export function payButtonState(status, earningsData) {
  if (!status.payoutsConfigured || !status.configured) return 'off';
  if (status.payoutMethod === 'A') return 'methodA';
  if (!earningsData || earningsData.payableCents <= 0 || earningsData.payableCoachCount <= 0) return 'nothing';
  return 'ready';
}

// The tone for an owed figure in a coach row.
export function owedTone(owedCents) {
  if (!Number.isInteger(owedCents)) return 'plain';
  if (owedCents < 0) return 'warn';
  if (owedCents > 0) return 'accent';
  return 'plain';
}

// ---- Reset password form ----

export const PASSWORD_MIN = 8;

// null when fine, else 'short' or 'mismatch' (short is checked first).
export function passwordResetError(password, again) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return 'short';
  if (password !== again) return 'mismatch';
  return null;
}

export const MONEY_OFF = {
  label: common.comingSoon,
  hint: common.moneyOffHint,
};
