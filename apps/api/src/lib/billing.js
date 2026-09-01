// The one Paddle module. Everything Cut knows about the payment provider is in
// this file: which environment variables switch it on, which web address may be
// called, how a checkout link is created, how a webhook is proved genuine, and
// how its contents are read. No other file names Paddle or a Paddle field, so
// swapping provider one day means rewriting this file and nothing else.
//
// Three rules:
//  1. Dormant until configured. With any of PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET
//     or PADDLE_PRICE_ID missing, the upgrade button says "coming soon" and the
//     webhook politely answers "not switched on". Setting the variables is the
//     whole activation — no code change, no migration.
//  2. One address, ever. api.paddle.com, or sandbox-api.paddle.com unless
//     PADDLE_ENV plainly says live. Anything unrecognised reads as sandbox,
//     which is the safe direction: a sandbox key cannot charge anybody.
//  3. The API key never leaves the server. It is read here, sent in one
//     Authorization header, and never logged, returned or stored.
//
// Where Paddle's answers are read, several plausible field names are tried and
// anything unreadable ends in a plain-English refusal rather than a guess.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';

export const LIVE_HOST = 'api.paddle.com';
export const SANDBOX_HOST = 'sandbox-api.paddle.com';

// One attempt at Paddle, then give up — no retry storm while somebody waits.
const REQUEST_TIMEOUT_MS = 10_000;

// How far out of step a webhook's own timestamp may be before it is refused as
// a replay of an old message. Five minutes (rather than a few seconds) because
// the host's clock isn't ours to control, and a webhook refused for clock skew
// is retried for days.
export const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

// Which Paddle world this deployment talks to. Only the words "live" or
// "production" mean real money; everything else — unset, blank, a typo — reads
// as the sandbox.
export function paddleEnvironment(env = process.env) {
  const value = (env.PADDLE_ENV ?? '').trim().toLowerCase();
  return value === 'live' || value === 'production' ? 'live' : 'sandbox';
}

// The app's own address, with any trailing slash removed, or null if it isn't a
// usable web address.
function appUrl(env) {
  const raw = (env.APP_URL ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return raw.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

// The provider's settings, or null while payments are switched off. All of the
// key, the webhook secret and the price are needed: a key with nothing to sell,
// or a price with no way to check a webhook, isn't half-on — it's dormant,
// which is a state that behaves rather than a state that breaks.
export function paddleConfig(env = process.env) {
  const apiKey = (env.PADDLE_API_KEY ?? '').trim();
  const webhookSecret = (env.PADDLE_WEBHOOK_SECRET ?? '').trim();
  const priceId = (env.PADDLE_PRICE_ID ?? '').trim();
  if (!apiKey || !webhookSecret || !priceId) return null;

  const environment = paddleEnvironment(env);
  return {
    apiKey,
    webhookSecret,
    priceId,
    environment,
    baseUrl: `https://${environment === 'live' ? LIVE_HOST : SANDBOX_HOST}`,
    // Local development falls back to the Vite dev server so the redirect back
    // from checkout still lands somewhere sensible.
    appUrl: appUrl(env) ?? 'http://localhost:5173',
  };
}

// True when the owner has set the payment variables. This is the only thing the
// rest of the app is ever told about the provider.
export function isBillingEnabled(env = process.env) {
  return paddleConfig(env) !== null;
}

/* ------------------------------------------------------------------ */
/* Talking to Paddle                                                   */
/* ------------------------------------------------------------------ */

// The only two web addresses this app ever calls about money, checked at the
// moment of the call rather than only when the address was built.
function isAllowedPaddleApiUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.port) return false;
  const host = url.hostname.toLowerCase();
  return host === LIVE_HOST || host === SANDBOX_HOST;
}

// Where a member may be redirected to pay. Paddle owns these addresses; if the
// answer points anywhere else, the checkout is not Paddle-hosted and nobody is
// sent there.
export function isPaddleHostedUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.port) return false;
  const host = url.hostname.toLowerCase();
  return host === 'paddle.com' || host.endsWith('.paddle.com');
}

// An id from Paddle that we are about to store or put in a web address. Never
// trusted by shape alone.
export function isSafePaddleId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

// One call to Paddle: one attempt, a hard timeout, redirects never followed,
// and nothing about the key or the answer's contents in any log line — only the
// status code and the path we asked for.
async function paddleFetch(config, path, { method, body }) {
  const url = `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  if (!isAllowedPaddleApiUrl(url)) return null;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'manual',
    });
  } catch {
    logger.warn('Could not reach the payment provider', { path });
    return null;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    // The status and the path are safe to record; the body is Paddle's and may
    // echo back what we sent, so it is never logged or shown to anybody.
    logger.warn('The payment provider refused a request', { status: response.status, path });
    return null;
  }

  return payload !== null && typeof payload === 'object' ? payload : {};
}

/* ------------------------------------------------------------------ */
/* Reading answers defensively                                         */
/* ------------------------------------------------------------------ */

function asRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

// Follows a dotted path through nested objects and returns the text at the end,
// or null when any step is missing.
function stringAt(root, path) {
  let current = root;
  for (const key of path.split('.')) {
    const record = asRecord(current);
    if (!record) return null;
    current = record[key];
  }
  return typeof current === 'string' && current.length > 0 ? current : null;
}

// The first https:// address anywhere in a small answer, as a last resort when
// none of the expected field names matched. Depth-limited so a strange answer
// can never spin forever.
function firstHttpsString(value, depth = 0) {
  if (depth > 5) return null;
  if (typeof value === 'string') return value.startsWith('https://') ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstHttpsString(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  for (const item of Object.values(record)) {
    const found = firstHttpsString(item, depth + 1);
    if (found) return found;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Checkout                                                            */
/* ------------------------------------------------------------------ */

// Creates the payment page a member is sent to, and returns its address — or
// null when Paddle didn't answer with something we can safely use.
//
// The member's own account id travels in `custom_data`, which Paddle copies
// onto the transaction and then onto the subscription, so every later webhook
// says which account it is about.
//
// This is a full-page redirect to Paddle's own site: no Paddle script is loaded
// inside Cut, so the content-security-policy in app.js needs nothing added.
export async function createCheckoutUrl(config, { userId, successUrl }) {
  const answer = await paddleFetch(config, '/transactions', {
    method: 'POST',
    body: {
      items: [{ price_id: config.priceId, quantity: 1 }],
      custom_data: { user_id: userId },
      // Paddle's way of saying "use this account's default payment link".
      checkout: { url: null },
    },
  });
  if (!answer) return null;

  const found =
    stringAt(answer, 'data.checkout.url') ??
    stringAt(answer, 'data.checkout_url') ??
    stringAt(answer, 'data.url') ??
    firstHttpsString(answer.data);

  if (!found || !isPaddleHostedUrl(found)) {
    // Either the answer was shaped differently from the documentation, or this
    // Paddle account has no hosted checkout switched on yet. Either way nobody
    // is redirected anywhere on a guess.
    logger.warn('The payment provider did not return a usable checkout address', {
      environment: config.environment,
    });
    return null;
  }

  // Where the member comes back to after paying. An extra query parameter is a
  // safe thing to be wrong about: if Paddle ignores it they simply stay on
  // Paddle's confirmation page, and the plan still changes when the webhook
  // arrives.
  const url = new URL(found);
  url.searchParams.set('success_url', successUrl);
  return url.toString();
}

/* ------------------------------------------------------------------ */
/* Proving a webhook really came from Paddle                           */
/* ------------------------------------------------------------------ */

// Reads a header like `ts=1724…;h1=abcd…` without caring about order or extra
// parts.
function readSignatureHeader(header) {
  let ts = null;
  let h1 = null;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const key = part.slice(0, at).trim().toLowerCase();
    const value = part.slice(at + 1).trim();
    if (key === 'ts') ts = value;
    if (key === 'h1') h1 = value;
  }
  return { ts, h1 };
}

// Compares two pieces of text in constant time so an attacker can't learn the
// right answer one character at a time.
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Is this webhook really from Paddle, and is it recent? Returns 'ok',
// 'missing', 'invalid' or 'stale'.
//
// Paddle signs the literal text `{timestamp}:{body exactly as sent}` with the
// notification destination's secret. THE BODY MUST BE THE RAW BYTES AS THEY
// ARRIVED — re-formatting the JSON changes the signature, which is why the
// webhook path skips JSON parsing in app.js and nothing is read until this
// check has passed.
export function checkWebhookSignature(rawBody, header, secret, now = Date.now()) {
  if (!header || typeof header !== 'string') return 'missing';

  const { ts, h1 } = readSignatureHeader(header);
  if (!ts || !h1) return 'missing';

  const seconds = Number(ts);
  if (!Number.isFinite(seconds)) return 'invalid';

  const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');
  if (!safeEqual(h1.toLowerCase(), expected)) return 'invalid';

  // Only once the signature holds is the age worth judging: saying "stale" to
  // an unsigned request would tell an attacker the timestamp was the only thing
  // wrong.
  if (Math.abs(now - seconds * 1000) > SIGNATURE_MAX_AGE_MS) return 'stale';

  return 'ok';
}

/* ------------------------------------------------------------------ */
/* Reading a webhook                                                   */
/* ------------------------------------------------------------------ */

// Every account id in Cut is a UUID. Anything else is not looked up.
function plausibleUserId(value) {
  if (typeof value !== 'string') return null;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)
    ? value
    : null;
}

// Turns a proven-genuine webhook into the few facts Cut acts on, or null when
// the message can't be read. Both the documented snake_case names and their
// camelCase twins are tried, and a missing field reads as "we don't know"
// rather than throwing.
export function readWebhookEvent(rawBody) {
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }

  const root = asRecord(payload);
  if (!root) return null;

  const eventId = stringAt(root, 'event_id') ?? stringAt(root, 'eventId');
  const eventType = stringAt(root, 'event_type') ?? stringAt(root, 'eventType');
  if (!eventId || !eventType) return null;

  const userId = plausibleUserId(
    stringAt(root, 'data.custom_data.user_id') ??
      stringAt(root, 'data.custom_data.userId') ??
      stringAt(root, 'data.customData.user_id') ??
      stringAt(root, 'data.customData.userId')
  );

  const customerId = stringAt(root, 'data.customer_id') ?? stringAt(root, 'data.customerId');

  return {
    eventId: eventId.slice(0, 200),
    eventType: eventType.slice(0, 100),
    userId,
    customerId: isSafePaddleId(customerId) ? customerId : null,
    status: stringAt(root, 'data.status'),
  };
}

/* ------------------------------------------------------------------ */
/* Which events move somebody's plan                                   */
/* ------------------------------------------------------------------ */

// The subscription is live and paid for.
const ACTIVATING_EVENTS = new Set(['subscription.activated']);

// The subscription has stopped. The account drops back to free and keeps every
// log, program and record it already has.
const DEACTIVATING_EVENTS = new Set([
  'subscription.canceled',
  'subscription.cancelled',
  'subscription.expired',
  'subscription.paused',
]);

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const ENDED_STATUSES = new Set(['canceled', 'cancelled', 'expired', 'paused']);

// What a webhook means for the account's plan: 'activate', 'deactivate' or
// 'none'. Paddle sends `subscription.updated` for renewals, upgrades and
// downgrades alike, so its own status is what decides. `past_due` is
// deliberately neither — Paddle is still retrying the payment, so the member
// keeps Premium while that happens.
export function planIntentFor(event) {
  if (ACTIVATING_EVENTS.has(event.eventType)) return 'activate';
  if (DEACTIVATING_EVENTS.has(event.eventType)) return 'deactivate';

  if (event.eventType === 'subscription.updated') {
    const status = (event.status ?? '').toLowerCase();
    if (ACTIVE_STATUSES.has(status)) return 'activate';
    if (ENDED_STATUSES.has(status)) return 'deactivate';
  }

  return 'none';
}
