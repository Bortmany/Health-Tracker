// Settings for the money side of the app, read from environment variables.
// Everything provider-specific stays inside this folder (lib/billing/): no
// other file names the payment provider, so a PayPal driver later is a swap.
//
// Rules:
//  1. Dormant until configured. With the API key or the webhook secret missing,
//     billingConfig() is null and every money button says "coming soon".
//  2. Sandbox unless WHOP_ENV plainly says "live". A typo reads as sandbox, the
//     safe direction: a sandbox key cannot charge anybody.
//  3. Keys never leave the server: nothing here is logged, and healthSummary()
//     (in index.js) reports only words like "configured", never a value.

// An error from the money side whose message is always safe to show a person:
// plain English, never containing a key, a secret or the provider's raw answer.
// `status` is the provider's HTTP status when there was one. `outcomeUnknown`
// is true when a request may have gone through even though we saw an error
// (a timeout, a dropped connection, a 5xx) — callers moving money must treat
// that as "maybe paid", not "not paid".
export class BillingError extends Error {
  constructor(message, { status = null, providerCode = null, outcomeUnknown = false } = {}) {
    super(message);
    this.name = 'BillingError';
    this.status = status;
    this.providerCode = providerCode;
    this.outcomeUnknown = outcomeUnknown;
  }
}

export const DEFAULT_PROVIDER = 'whop';
export const SUPPORTED_PROVIDERS = ['whop'];

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Which provider this deployment uses. Unset = whop.
export function providerName(env = process.env) {
  return text(env.MONEY_PROVIDER).toLowerCase() || DEFAULT_PROVIDER;
}

// 'live' only when WHOP_ENV says so; everything else is the sandbox.
export function providerEnvironment(env = process.env) {
  const value = text(env.WHOP_ENV).toLowerCase();
  return value === 'live' ? 'live' : 'sandbox';
}

// The app's own address without a trailing slash. Local development falls back
// to the Vite dev server so the redirect back from checkout still lands
// somewhere sensible.
function appUrlFrom(env) {
  const raw = text(env.APP_URL);
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === 'https:' || url.protocol === 'http:') return raw.replace(/\/+$/, '');
    } catch {
      // fall through to the default
    }
  }
  return 'http://localhost:5173';
}

// The provider's settings, or null while payments are switched off (or the
// chosen provider has no driver yet). Both the API key and the webhook secret
// are needed: a key with no way to check webhooks isn't half-on, it's dormant.
export function billingConfig(env = process.env) {
  const provider = providerName(env);
  if (!SUPPORTED_PROVIDERS.includes(provider)) return null;

  const apiKey = text(env.WHOP_API_KEY);
  const webhookSecret = text(env.WHOP_WEBHOOK_SECRET);
  if (!apiKey || !webhookSecret) return null;

  return {
    provider,
    apiKey,
    webhookSecret,
    companyId: text(env.WHOP_COMPANY_ID) || null,
    environment: providerEnvironment(env),
    appUrl: appUrlFrom(env),
    // The provider's own plan ids for the three things Cut sells itself. A
    // missing one is fine: the driver then describes the plan inline.
    plans: {
      startupFee: text(env.WHOP_STARTUP_FEE_PLAN_ID) || null,
      aiMonthly: text(env.WHOP_AI_MONTHLY_PLAN_ID) || null,
      aiYearly: text(env.WHOP_AI_YEARLY_PLAN_ID) || null,
    },
  };
}

// True when the owner has set the payment variables.
export function isBillingEnabled(env = process.env) {
  return billingConfig(env) !== null;
}

// Which way coaches get paid: 'A' (the provider takes Cut's fee on every
// payment) or 'B' (Cut collects, then transfers the coach's share). Anything
// else is unset, and unset means payouts are dormant.
export function payoutMethod(env = process.env) {
  const value = text(env.PAYOUT_METHOD).toUpperCase();
  return value === 'A' || value === 'B' ? value : null;
}

// Payouts need payments on AND a chosen method.
export function isPayoutsEnabled(env = process.env) {
  return isBillingEnabled(env) && payoutMethod(env) !== null;
}
