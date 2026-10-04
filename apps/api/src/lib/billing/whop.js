// The Whop driver — the only file that knows Whop's web addresses, field names
// and event names. It uses plain fetch and node:crypto (no SDK), and the client
// takes an injectable fetch so tests never touch the network.
//
// Three parts:
//  1. verifyWebhook / parseWebhookEvent — proving a webhook is genuine, then
//     turning Whop's envelope into the few provider-neutral facts Cut acts on.
//  2. createWhopClient — checkout, coach onboarding, cancel, transfers.
//  3. small defensive helpers shared by both.
//
// Things in Whop's documentation that were NOT confirmed when this was written
// are marked "UNCONFIRMED" below. Each one needs a look in Whop's sandbox
// (see GO-LIVE.md) before real money moves.

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { logger } from '../logger.js';
import { BillingError } from './config.js';

export const LIVE_API_BASE = 'https://api.whop.com/api/v1';
export const SANDBOX_API_BASE = 'https://sandbox-api.whop.com/api/v1';

// One attempt at Whop, then give up — no retry storm while somebody waits.
const REQUEST_TIMEOUT_MS = 10_000;

// How far out of step a webhook's own timestamp may be. Five minutes, because
// the sending host's clock isn't ours to control.
export const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Small defensive helpers                                             */
/* ------------------------------------------------------------------ */

function asRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// An id from Whop that we are about to store or put in a web address. Never
// trusted by shape alone.
export function isSafeProviderId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(value);
}

function safeId(value) {
  return isSafeProviderId(value) ? value : null;
}

// Every account id in Cut is a UUID. Anything else is not looked up.
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function uuidOrNull(value) {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

// Whop sends money as dollars (a number or a numeric string); Cut stores whole
// cents. Anything unreadable or negative reads as "unknown" (null).
function dollarsToCents(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}

function centsToDollars(cents) {
  return cents / 100;
}

// A date as an ISO string, or null. Accepts ISO text, unix seconds or unix
// milliseconds, because Whop's documentation is not explicit which it sends.
function toIso(value) {
  let ms = null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    ms = value < 1e12 ? value * 1000 : value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    ms = /^\d+(\.\d+)?$/.test(value.trim())
      ? (Number(value) < 1e12 ? Number(value) * 1000 : Number(value))
      : Date.parse(value);
  }
  if (ms === null || !Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// First non-empty string found at any of these keys.
function pickString(record, keys) {
  if (!record) return null;
  for (const key of keys) {
    const value = nonEmptyString(record[key]);
    if (value) return value;
  }
  return null;
}

// A header from either a plain object (any capitalisation) or a Headers object.
function readHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') {
    const value = headers.get(name);
    return typeof value === 'string' ? value : null;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) {
      const first = Array.isArray(value) ? value[0] : value;
      return typeof first === 'string' ? first : null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Proving a webhook really came from Whop                             */
/* ------------------------------------------------------------------ */

// Is this webhook genuine and recent? Returns 'ok', 'missing',
// 'bad_signature' or 'stale'.
//
// Whop follows the Standard Webhooks scheme: three headers (webhook-id,
// webhook-timestamp in unix seconds, webhook-signature = one or more
// space-separated "v1,<base64>" entries). The signature is HMAC-SHA256 over the
// literal text `${id}.${timestamp}.${body}` using the secret's own text (the
// whole "ws_..." string as UTF-8 bytes — NOT base64-decoded, unlike some other
// providers), written as base64.
//
// THE BODY MUST BE THE RAW BYTES AS THEY ARRIVED — re-formatting the JSON
// changes the signature, which is why the webhook path skips JSON parsing in
// app.js and nothing is read until this check has passed.
export function verifyWebhook(rawBody, headers, secret, now = Date.now()) {
  const id = readHeader(headers, 'webhook-id');
  const timestamp = readHeader(headers, 'webhook-timestamp');
  const signatureHeader = readHeader(headers, 'webhook-signature');
  const bodyOk = typeof rawBody === 'string' || Buffer.isBuffer(rawBody);

  if (!id || !timestamp || !signatureHeader || !bodyOk) return 'missing';
  if (typeof secret !== 'string' || secret.length === 0) return 'missing';

  // Whole seconds only — "1e9", "abc", "-5", or "12.5" are not timestamps.
  if (!/^\d{1,12}$/.test(timestamp.trim())) return 'bad_signature';
  const seconds = Number(timestamp.trim());

  // The signature covers the timestamp text exactly as sent, so use it as sent.
  const expected = createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest('base64');
  const expectedBuffer = Buffer.from(expected);

  // Every listed signature is checked (Whop lists several while a secret is
  // being rotated), each in constant time, and none is skipped once one
  // matches, so timing reveals nothing about which one was right.
  let matched = false;
  for (const entry of signatureHeader.trim().split(/\s+/).slice(0, 10)) {
    const comma = entry.indexOf(',');
    if (comma < 0) continue;
    if (entry.slice(0, comma) !== 'v1') continue;
    const candidate = Buffer.from(entry.slice(comma + 1));
    if (candidate.length === expectedBuffer.length && timingSafeEqual(candidate, expectedBuffer)) {
      matched = true;
    }
  }
  if (!matched) return 'bad_signature';

  // Only once the signature holds is the age worth judging: saying "stale" to
  // an unsigned request would tell an attacker the timestamp was the only
  // thing wrong.
  if (Math.abs(now - seconds * 1000) > SIGNATURE_MAX_AGE_MS) return 'stale';

  return 'ok';
}

/* ------------------------------------------------------------------ */
/* Reading a webhook                                                   */
/* ------------------------------------------------------------------ */

// Dispute states where the money is currently held back from the coach.
const OPEN_DISPUTE_STATUSES = new Set(['needs_response', 'warning_needs_response', 'under_review', 'warning_under_review']);
const KINDS = new Set(['coach_startup_fee', 'coach_student', 'ai_plan']);
const INTERVALS = new Set(['month', 'year']);

// Whop copies the checkout's metadata onto payments and memberships. Refunds
// and disputes carry the payment inside, so look there too. First value found
// wins; both snake_case and camelCase spellings are accepted.
function readMetadata(data) {
  const sources = [
    asRecord(data.metadata),
    asRecord(asRecord(data.payment)?.metadata),
    asRecord(asRecord(data.membership)?.metadata),
    asRecord(asRecord(data.checkout_configuration)?.metadata),
  ].filter(Boolean);

  function find(...keys) {
    for (const source of sources) {
      const value = pickString(source, keys);
      if (value) return value;
    }
    return null;
  }

  const kind = find('kind');
  const interval = find('interval');
  const reference = find('reference');
  return {
    userId: uuidOrNull(find('userId', 'user_id')),
    kind: kind && KINDS.has(kind) ? kind : null,
    interval: interval && INTERVALS.has(interval) ? interval : null,
    coachUserId: uuidOrNull(find('coachUserId', 'coach_user_id')),
    linkId: uuidOrNull(find('linkId', 'link_id')),
    reference: reference ? reference.slice(0, 200) : null,
  };
}

function nested(record, key) {
  return asRecord(record?.[key]);
}

// The event's amount in whole cents (USD), or null. UNCONFIRMED: the payment
// object's money field names — `total` is tried first, then close cousins; when
// the payment is in another currency and a USD total is present, that is used.
function readPaymentAmount(data) {
  const currency = (nonEmptyString(data.currency) ?? 'usd').toLowerCase();
  if (currency !== 'usd') {
    const usd = dollarsToCents(data.usd_total);
    if (usd !== null) return { amountCents: usd, currency: 'usd' };
  }
  const cents = [data.total, data.amount, data.final_amount, data.subtotal]
    .map(dollarsToCents)
    .find((value) => value !== null);
  return { amountCents: cents ?? null, currency };
}

const EMPTY_EVENT = {
  eventId: null,
  type: 'ignored',
  providerPaymentId: null,
  providerEventRef: null,
  refundedPaymentId: null,
  providerSubscriptionId: null,
  providerCustomerId: null,
  providerAccountId: null,
  amountCents: null,
  currency: null,
  periodStart: null,
  periodEnd: null,
  metadata: { userId: null, kind: null, interval: null, coachUserId: null, linkId: null, reference: null },
};

// Turns a proven-genuine webhook body into the provider-neutral facts Cut acts
// on, or null when it can't be read at all. Never throws on odd shapes: a
// missing field reads as "we don't know" (null) and an event we don't use
// reads as type 'ignored'.
//
// Mapping:
//   payment.succeeded -> payment.succeeded        payment.failed -> payment.failed
//   refund.created/updated (status succeeded) -> payment.refunded
//   dispute.created / dispute.updated (still open) -> payment.disputed
//   dispute.updated (won) -> payment.dispute_won
//   membership.activated -> subscription.started
//   membership.cancel_at_period_end_changed (now true) -> subscription.cancel_scheduled
//   membership.deactivated -> subscription.ended
//   identity_profile.approved / verification.succeeded /
//     payout_account.status_updated (status connected) -> coach.identity_verified
export function parseWebhookEvent(rawBody) {
  try {
    const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    if (typeof text !== 'string') return null;

    let envelope;
    try {
      envelope = JSON.parse(text);
    } catch {
      return null;
    }
    const root = asRecord(envelope);
    if (!root) return null;

    const rawType = nonEmptyString(root.type) ?? '';
    const data = asRecord(root.data) ?? {};

    const event = {
      ...EMPTY_EVENT,
      eventId: nonEmptyString(root.id) ? root.id.slice(0, 200) : null,
      metadata: readMetadata(data),
      // Whop's envelope says which account the event happened on (older
      // payloads called it company_id).
      providerAccountId: safeId(
        pickString(root, ['account_id', 'company_id']) ??
          pickString(data, ['account_id', 'company_id']) ??
          pickString(nested(data, 'company'), ['id'])
      ),
    };

    const customer = safeId(
      pickString(data, ['user_id']) ??
        pickString(nested(data, 'user'), ['id']) ??
        pickString(nested(data, 'member'), ['id'])
    );

    switch (rawType) {
      case 'payment.succeeded':
      case 'payment.failed': {
        const amount = readPaymentAmount(data);
        const membership = nested(data, 'membership');
        return {
          ...event,
          type: rawType,
          providerPaymentId: safeId(data.id),
          providerEventRef: safeId(data.id),
          providerSubscriptionId: safeId(
            pickString(data, ['membership_id']) ?? pickString(membership, ['id'])
          ),
          providerCustomerId: customer,
          amountCents: amount.amountCents,
          currency: amount.currency,
          periodStart: toIso(data.current_period_start ?? membership?.current_period_start),
          periodEnd: toIso(data.current_period_end ?? membership?.current_period_end),
        };
      }

      case 'refund.created':
      case 'refund.updated': {
        // Only a refund that has actually gone through counts; pending, failed
        // and canceled ones are ignored until a later update says succeeded.
        if (nonEmptyString(data.status)?.toLowerCase() !== 'succeeded') return event;
        const paymentId = safeId(
          pickString(data, ['payment_id']) ?? pickString(nested(data, 'payment'), ['id'])
        );
        return {
          ...event,
          type: 'payment.refunded',
          providerPaymentId: paymentId,
          providerEventRef: safeId(data.id),
          refundedPaymentId: paymentId,
          providerCustomerId: customer,
          amountCents: dollarsToCents(data.amount),
          currency: (nonEmptyString(data.currency) ?? 'usd').toLowerCase(),
        };
      }

      // A dispute: opening it (and any update that still says it is open)
      // takes the coach's share back; WON gives it back; lost or anything else
      // does nothing more. dispute.created and dispute.updated can both announce
      // the same open dispute - the ledger writes only one row per dispute.
      case 'dispute.created':
      case 'dispute.updated': {
        const status = nonEmptyString(data.status)?.toLowerCase() ?? '';
        let type = 'ignored';
        if (OPEN_DISPUTE_STATUSES.has(status) || (rawType === 'dispute.created' && status === '')) {
          type = 'payment.disputed';
        } else if (status === 'won') {
          type = 'payment.dispute_won';
        }
        if (type === 'ignored') return event;
        const paymentId = safeId(
          pickString(data, ['payment_id']) ?? pickString(nested(data, 'payment'), ['id'])
        );
        return {
          ...event,
          type,
          providerPaymentId: paymentId,
          providerEventRef: safeId(data.id),
          providerCustomerId: customer,
          amountCents: dollarsToCents(data.amount),
          currency: (nonEmptyString(data.currency) ?? 'usd').toLowerCase(),
        };
      }

      case 'membership.activated':
      case 'membership.deactivated':
      case 'membership.cancel_at_period_end_changed': {
        let type = 'ignored';
        if (rawType === 'membership.activated') type = 'subscription.started';
        else if (rawType === 'membership.deactivated') type = 'subscription.ended';
        else if (data.cancel_at_period_end === true) type = 'subscription.cancel_scheduled';
        return {
          ...event,
          type,
          providerSubscriptionId: safeId(data.id),
          providerCustomerId: customer,
          periodStart: toIso(data.current_period_start),
          periodEnd: toIso(data.current_period_end),
        };
      }

      case 'identity_profile.approved':
      case 'verification.succeeded':
        return { ...event, type: 'coach.identity_verified' };

      case 'payout_account.status_updated':
        // UNCONFIRMED: the exact status word. Whop's list of payout-account
        // states includes "connected"; anything else is not "verified".
        return nonEmptyString(data.status)?.toLowerCase() === 'connected'
          ? { ...event, type: 'coach.identity_verified' }
          : event;

      default:
        return event;
    }
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Talking to Whop                                                     */
/* ------------------------------------------------------------------ */

// Where a member may be sent to pay or onboard. Whop owns these addresses; if an
// answer points anywhere else, nobody is redirected there.
export function isWhopHostedUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return host === 'whop.com' || host.endsWith('.whop.com');
}

function requireHostedUrl(value, what) {
  if (typeof value !== 'string' || !isWhopHostedUrl(value)) {
    throw new BillingError(`The payment provider did not give a usable ${what} address.`);
  }
  return value;
}

function requireId(value, what) {
  if (!isSafeProviderId(value)) throw new BillingError(`That ${what} reference is not valid.`);
  return value;
}

function requireWebAddress(value, what) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch {
    // fall through
  }
  throw new BillingError(`The ${what} address is not valid.`);
}

// A header value that can never carry line breaks or odd characters.
function cleanKey(value) {
  return String(value).replace(/[^\x21-\x7e]/g, '_').slice(0, 255);
}

// Metadata that travels with a checkout: the account ids and the idempotent
// reference, as text, with empty values left out. Whop copies this onto the
// payments and memberships the checkout creates.
function checkoutMetadata({ userId, kind, interval, coachUserId, linkId, reference }) {
  const metadata = { userId, kind };
  if (interval) metadata.interval = interval;
  if (coachUserId) metadata.coachUserId = coachUserId;
  if (linkId) metadata.linkId = linkId;
  if (reference) metadata.reference = String(reference).slice(0, 200);
  return metadata;
}

// The Whop client. `config` comes from billingConfig(); `options.fetch` lets a
// test stand in for the network.
export function createWhopClient(config, options = {}) {
  const baseUrl = config.environment === 'live' ? LIVE_API_BASE : SANDBOX_API_BASE;
  // Looked up at call time so tests that swap globalThis.fetch still work.
  const doFetch = options.fetch ?? ((...args) => globalThis.fetch(...args));

  // One call to Whop: one attempt, a hard timeout, redirects never followed.
  // Nothing about the key or Whop's answer is logged or put in an error — only
  // the status code and the path.
  async function call(method, path, { body, idempotencyKey } = {}) {
    const headers = {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    // Every write carries an idempotency key so a retry can't do it twice.
    if (method === 'POST') headers['Idempotency-Key'] = cleanKey(idempotencyKey ?? randomUUID());

    let response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'manual',
      });
    } catch {
      logger.warn('Could not reach the payment provider', { method, path });
      throw new BillingError('Could not reach the payment provider. Please try again in a moment.', {
        outcomeUnknown: method === 'POST',
      });
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      logger.warn('The payment provider refused a request', { method, path, status: response.status });
      const code = nonEmptyString(asRecord(payload?.error)?.code) ?? nonEmptyString(asRecord(payload?.error)?.type);
      let message = `The payment provider could not complete that (code ${response.status}). Please try again later.`;
      if (response.status === 401 || response.status === 403) {
        message = 'The payment provider did not accept Cut’s credentials. Please contact support.';
      } else if (response.status === 409) {
        message = 'The payment provider is still working on that request. Please wait a moment.';
      } else if (response.status === 429) {
        message = 'The payment provider is busy. Please try again in a moment.';
      }
      throw new BillingError(message, {
        status: response.status,
        providerCode: code ? code.slice(0, 60) : null,
        // 409 means Whop is still working on a request with the SAME key, so
        // the first attempt may well have gone through: never "definitely not
        // sent". Same for any 5xx. Only a clear refusal (400/401/403/404/422...)
        // is known-not-done.
        outcomeUnknown: response.status >= 500 || response.status === 409,
      });
    }

    return asRecord(payload) ?? {};
  }

  // ---- Checkout ----

  async function createCheckout(args) {
    const {
      kind,
      interval = null,
      userId,
      coachUserId = null,
      linkId = null,
      amountCents,
      platformFeePercent = null,
      providerAccountId = null, // the coach's connected account (coach_student only)
      successUrl,
      reference = null,
      idempotencyKey = null,
    } = args ?? {};

    if (!KINDS.has(kind)) throw new BillingError('That kind of payment is not recognised.');
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new BillingError('A signed-in account is needed to start a payment.');
    }
    const redirectUrl = requireWebAddress(successUrl, 'return');

    const metadata = checkoutMetadata({ userId, kind, interval, coachUserId, linkId, reference });
    const body = { redirect_url: redirectUrl, metadata };

    if (kind === 'coach_student') {
      // The student pays the coach directly: a monthly plan on the COACH's
      // connected account, with Cut's fee taken off the top by Whop.
      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        throw new BillingError('The coach’s monthly price is not valid.');
      }
      const coachAccount = requireId(providerAccountId, 'coach account');
      const plan = {
        // Whop's default (older) API version wants company_id here; the newer
        // one calls it account_id. We stay on the default version because
        // application_fee_amount is only documented there. UNCONFIRMED: the
        // top-level account_id may be redundant; check in the sandbox.
        company_id: coachAccount,
        currency: 'usd',
        plan_type: 'renewal',
        initial_price: centsToDollars(amountCents),
        renewal_price: centsToDollars(amountCents),
        billing_period: 30,
        title: 'Monthly coaching on Cut',
        product: { external_identifier: `cut-coach-${coachUserId ?? 'unknown'}`, title: 'Coaching on Cut' },
      };
      if (platformFeePercent !== null && platformFeePercent !== undefined) {
        if (!(typeof platformFeePercent === 'number' && platformFeePercent > 0 && platformFeePercent < 100)) {
          throw new BillingError('Cut’s fee percentage is not valid.');
        }
        // In dollars, rounded to the cent, and always below the price. UNCONFIRMED:
        // whether Whop repeats this fee on every renewal (Method A depends on it).
        plan.application_fee_amount = centsToDollars(Math.round((amountCents * platformFeePercent) / 100));
      }
      body.account_id = coachAccount;
      body.plan = plan;
    } else {
      // Cut's own products are charged on Cut's own account, through the plan
      // ids the owner set up — or described inline when no id is configured.
      let planId = null;
      let plan = null;
      if (kind === 'coach_startup_fee') {
        planId = config.plans.startupFee;
        plan = { plan_type: 'one_time', title: 'Cut coach startup fee' };
      } else {
        if (!INTERVALS.has(interval)) throw new BillingError('Choose monthly or yearly for the AI plan.');
        planId = interval === 'year' ? config.plans.aiYearly : config.plans.aiMonthly;
        plan = {
          plan_type: 'renewal',
          billing_period: interval === 'year' ? 365 : 30,
          title: interval === 'year' ? 'Cut AI plan (yearly)' : 'Cut AI plan (monthly)',
        };
      }

      if (planId) {
        body.plan_id = requireId(planId, 'plan');
      } else {
        if (!Number.isInteger(amountCents) || amountCents <= 0) {
          throw new BillingError('The price for that payment is not valid.');
        }
        if (!config.companyId) throw new BillingError('Payments are not fully set up yet.');
        const dollars = centsToDollars(amountCents);
        body.plan = {
          ...plan,
          company_id: config.companyId,
          currency: 'usd',
          initial_price: dollars,
          ...(plan.plan_type === 'renewal' ? { renewal_price: dollars } : {}),
          product: {
            external_identifier: kind === 'coach_startup_fee' ? 'cut-startup-fee' : 'cut-ai-plan',
            title: kind === 'coach_startup_fee' ? 'Cut coach startup fee' : 'Cut AI plan',
          },
        };
      }
    }

    // A checkout page has no "cancel" address in Whop's API: if the person
    // backs out they simply land back where they were, so cancelUrl is unused.
    const answer = await call('POST', '/checkout_configurations', { body, idempotencyKey });
    const url = answer.purchase_url ?? answer.url;
    return { url: requireHostedUrl(url, 'checkout') };
  }

  // ---- Coach onboarding ----

  async function createCoachOnboardingLink({
    coachUserId,
    providerAccountId = null,
    returnUrl,
    email = null,
    name = null,
    idempotencyKey = null,
  } = {}) {
    const returnAddress = requireWebAddress(returnUrl, 'return');
    let accountId = providerAccountId;

    if (accountId) {
      requireId(accountId, 'coach account');
    } else {
      // First time: create the coach's connected account under Cut's. Whop
      // requires the coach's email for a connected account.
      const created = await call('POST', '/accounts', {
        body: {
          ...(email ? { email } : {}),
          title: name ? String(name).slice(0, 100) : 'Cut coach',
          metadata: { coachUserId: String(coachUserId ?? '') },
        },
        idempotencyKey,
      });
      accountId = requireId(created.id, 'coach account');
    }

    // The identity-check link. Whop's published schema names the field
    // account_id, but several of its guide samples send company_id instead.
    // UNCONFIRMED which one the server accepts — we follow the schema; if the
    // sandbox rejects it, swap the key below to company_id.
    const link = await call('POST', '/account_links', {
      body: {
        account_id: accountId,
        return_url: returnAddress,
        refresh_url: returnAddress,
        use_case: 'account_onboarding',
      },
      idempotencyKey: idempotencyKey ? `${idempotencyKey}-link` : null,
    });
    return { url: requireHostedUrl(link.url, 'identity check'), providerAccountId: accountId };
  }

  // ---- Cancel ----

  // Stops renewals but keeps access to the end of the period already paid for.
  async function cancelSubscription({ providerSubscriptionId } = {}) {
    const id = requireId(providerSubscriptionId, 'subscription');
    let answer;
    try {
      answer = await call('POST', `/memberships/${encodeURIComponent(id)}/cancel`, {
        body: { cancel_at_period_end: true },
      });
    } catch (err) {
      // The provider no longer has this subscription (already cancelled or
      // gone): the goal is met, so say so in provider-neutral terms.
      if (err?.status === 404) return { alreadyGone: true };
      throw err;
    }
    return { periodEnd: toIso(answer.current_period_end) };
  }

  // ---- Payouts ----

  function mapTransferStatus(status) {
    const value = typeof status === 'string' ? status.toLowerCase() : '';
    if (value === 'succeeded') return 'paid';
    if (value === 'failed') return 'failed';
    // processing — and anything we don't recognise, which must never be
    // mistaken for "paid".
    return 'pending';
  }

  // Moves the coach's share from Cut's balance to the coach's account (Method
  // B). The caller's idempotency key (the payout row's id) is sent both ways
  // Whop accepts it, so a repeated request can never pay twice.
  async function transferToCoach({ idempotencyKey, providerAccountId, amountCents } = {}) {
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) {
      throw new BillingError('A payout needs its own reference before it can be sent.');
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BillingError('The payout amount is not valid.');
    }
    const destination = requireId(providerAccountId, 'coach account');
    if (!config.companyId) throw new BillingError('Payments are not fully set up yet.');

    const answer = await call('POST', '/transfers', {
      body: {
        origin_id: config.companyId,
        destination_id: destination,
        amount: centsToDollars(amountCents),
        currency: 'usd',
        idempotence_key: idempotencyKey,
        // Our own payout id too, so a later lookup can find this transfer even
        // if the provider does not echo the key back.
        metadata: { payoutId: idempotencyKey },
        notes: 'Cut coach payout',
      },
      idempotencyKey,
    });
    return {
      providerReference: requireId(answer.id, 'transfer'),
      status: mapTransferStatus(answer.status),
    };
  }

  async function getPayoutStatus({ providerReference } = {}) {
    const id = requireId(providerReference, 'transfer');
    const answer = await call('GET', `/transfers/${encodeURIComponent(id)}`);
    return { status: mapTransferStatus(answer.status) };
  }

  // Looks for a transfer sent under OUR key (the payout's own key). The answer
  // is one of:
  //   { found: true, providerReference, status }  - it exists
  //   { found: false }                            - we looked at EVERYTHING sent to
  //                                                 that account and it is not there
  // Anything that stops us being sure (an error, too many pages, entries we
  // cannot read) THROWS, because "I could not look" must never be mistaken for
  // "it was never sent". UNCONFIRMED against the live service: the list's
  // paging names and whether each entry echoes the key; until confirmed in the
  // sandbox this errs on the side of throwing, which only keeps money held.
  const LOOKUP_MAX_PAGES = 10;
  async function findTransferByKey({ idempotencyKey, providerAccountId } = {}) {
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) {
      throw new BillingError('A payout lookup needs the payout key.');
    }
    const destination = requireId(providerAccountId, 'coach account');
    if (!config.companyId) throw new BillingError('Payments are not fully set up yet.');
    let cursor = null;
    for (let page = 0; page < LOOKUP_MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ origin_id: config.companyId, destination_id: destination });
      if (cursor) query.set('after', cursor);
      const answer = await call('GET', `/transfers?${query.toString()}`);
      const items = Array.isArray(answer.data) ? answer.data : null;
      if (!items) throw new BillingError('The payment provider gave an answer we could not read.');
      for (const item of items) {
        const record = asRecord(item);
        const echoedKey = nonEmptyString(record?.idempotence_key);
        const ourId = nonEmptyString(asRecord(record?.metadata)?.payoutId);
        if (!echoedKey && !ourId) {
          throw new BillingError('The payment provider did not say which payout a transfer belongs to.');
        }
        if (echoedKey === idempotencyKey || ourId === idempotencyKey) {
          return {
            found: true,
            providerReference: requireId(record.id, 'transfer'),
            status: mapTransferStatus(record.status),
          };
        }
      }
      const info = asRecord(answer.page_info);
      if (!info?.has_next_page) return { found: false };
      cursor = nonEmptyString(info.end_cursor);
      if (!cursor) throw new BillingError('The payment provider gave an answer we could not read.');
    }
    throw new BillingError('There are too many transfers to check them all.');
  }

  // ---- Refunds ----

  // Gives a payment back in full. The key makes a repeat harmless.
  async function refundPayment({ providerPaymentId, idempotencyKey } = {}) {
    const id = requireId(providerPaymentId, 'payment');
    await call('POST', `/payments/${encodeURIComponent(id)}/refund`, {
      body: {},
      idempotencyKey: idempotencyKey ?? `auto-refund-${id}`,
    });
    return { refunded: true };
  }

  return {
    createCheckout,
    createCoachOnboardingLink,
    cancelSubscription,
    transferToCoach,
    getPayoutStatus,
    findTransferByKey,
    refundPayment,
  };
}

// What index.js needs from a driver.
export const whopDriver = { createClient: createWhopClient, verifyWebhook, parseWebhookEvent };
