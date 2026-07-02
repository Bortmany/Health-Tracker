// Dormant Stripe billing. The upgrade flow ships fully built but asleep:
// it wakes up when STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and
// STRIPE_PRICE_ID are added to the server's environment (plus APP_URL for
// the redirect back). Until then every billing route answers with a
// friendly "not switched on yet" message.

import Stripe from 'stripe';

let stripeClient = null;

export function isBillingEnabled() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_PRICE_ID
  );
}

export function getStripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}
