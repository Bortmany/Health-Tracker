// The money side of Cut, provider-neutral. Routes import ONLY from this file
// (../lib/billing/index.js); everything that names the payment provider lives
// inside this folder, so switching to PayPal later means adding a driver here
// and touching nothing else.
//
// Dormant until configured: with the settings missing, isBillingEnabled() is
// false, every money button says "coming soon", and getBillingClient() refuses
// with a plain message.

import { isEmailEnabled } from '../email.js';
import {
  BillingError,
  billingConfig,
  isBillingEnabled,
  isPayoutsEnabled,
  payoutMethod,
  providerEnvironment,
  providerName,
} from './config.js';
import { whopDriver, isSafeProviderId, SIGNATURE_MAX_AGE_MS } from './whop.js';

export {
  BillingError,
  billingConfig,
  isBillingEnabled,
  isPayoutsEnabled,
  payoutMethod,
  isSafeProviderId,
  SIGNATURE_MAX_AGE_MS,
};

// One entry per supported provider. A PayPal driver would be added here with
// the same three functions.
const DRIVERS = { whop: whopDriver };

function driverFor(env = process.env) {
  return DRIVERS[providerName(env)] ?? null;
}

// Is this webhook genuine and recent? 'ok' | 'missing' | 'bad_signature' |
// 'stale'. `headers` are the request's headers, `rawBody` the exact bytes.
export function verifyWebhook(rawBody, headers, secret, now = Date.now()) {
  const driver = driverFor();
  return driver ? driver.verifyWebhook(rawBody, headers, secret, now) : 'missing';
}

// A genuine webhook's contents as provider-neutral facts, or null if unreadable.
export function parseWebhookEvent(rawBody) {
  const driver = driverFor();
  return driver ? driver.parseWebhookEvent(rawBody) : null;
}

// Tests put a fake client here; null removes it.
let injectedClient = null;
export function setBillingClient(client) {
  injectedClient = client ?? null;
}

// The object that makes calls to the provider (checkout, onboarding, cancel,
// transfer, payout status). Throws a plain error while payments are dormant.
export function getBillingClient() {
  if (injectedClient) return injectedClient;
  const config = billingConfig();
  const driver = driverFor();
  if (!config || !driver) {
    throw new BillingError('Payments are not switched on yet.');
  }
  return driver.createClient(config);
}

// What /api/health may say about money: words only, never a key or a secret.
export function healthSummary(env = process.env) {
  const method = payoutMethod(env);
  return {
    billing: {
      state: isBillingEnabled(env) ? 'configured' : 'dormant',
      provider: providerName(env),
      environment: providerEnvironment(env),
    },
    payouts: {
      state: isPayoutsEnabled(env) ? 'configured' : 'dormant',
      method,
    },
    email: { state: isEmailEnabled(env) ? 'configured' : 'dormant' },
  };
}
