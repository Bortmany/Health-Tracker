// Shared helpers for the money tests (not a test itself). Everything here is
// offline: payments go to the fake billing client, emails are kept in memory,
// and webhooks are signed with a throwaway secret.
import assert from 'node:assert/strict';
import { generateReferralCode } from '../lib/coachProfiles.js';
import { buildFakeEvent, createFakeBillingClient, signTestWebhook } from '../lib/billing/fake.js';

export const WEBHOOK_SECRET = 'test-webhook-secret-not-a-real-one';
export { buildFakeEvent, createFakeBillingClient, signTestWebhook };

// Switch payments on (and pick a payout method) for this test process. The
// settings are read on every request, so this can run before or after the app loads.
export function moneyOn({ method = 'B' } = {}) {
  process.env.WHOP_API_KEY = 'test-api-key-not-a-real-one';
  process.env.WHOP_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.WHOP_ENV = 'sandbox';
  if (method) process.env.PAYOUT_METHOD = method;
  else delete process.env.PAYOUT_METHOD;
}

// Switch every money and email setting off (a developer's .env may have some).
export function moneyOff() {
  for (const name of ['WHOP_API_KEY', 'WHOP_WEBHOOK_SECRET', 'WHOP_COMPANY_ID', 'PAYOUT_METHOD', 'RESEND_API_KEY', 'EMAIL_FROM']) {
    delete process.env[name];
  }
}

export function startKit(app, pool) {
  const kit = { server: null, baseUrl: '', run: `${Date.now()}${Math.random().toString(36).slice(2, 6)}` };

  kit.start = () => {
    kit.server = app.listen(0);
    kit.baseUrl = `http://localhost:${kit.server.address().port}/api`;
  };
  kit.stop = async () => {
    // The owner grant only fires when nobody is admin, so don't leave test admins behind.
    await pool.query("UPDATE users SET is_admin = false WHERE email LIKE 'money-%'");
    await new Promise((resolve) => kit.server.close(resolve));
    await pool.end();
  };

  kit.call = (who, method, path, body) =>
    fetch(`${kit.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(who ? { Cookie: who.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  kit.register = async (label) => {
    const email = `money-${label}-${kit.run}@example.com`;
    const res = await fetch(`${kit.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'hunter2pass', displayName: `${label} User` }),
    });
    assert.equal(res.status, 201);
    const cookie = res.headers.get('set-cookie').split(';')[0];
    const { user } = await res.json();
    return { cookie, user, id: user.id, email };
  };

  // A coach with a public profile. `ready` also gives them the three things the
  // money rules need: startup fee paid, identity verified, a price set.
  kit.makeCoach = async (label, { ready = false, priceCents = 3000, accountId } = {}) => {
    const account = await kit.register(label);
    await pool.query("UPDATE users SET role = 'coach' WHERE id = $1", [account.id]);
    await pool.query(
      `INSERT INTO coach_profiles (user_id, slug, referral_code, headline, bio, specialties, is_public, accepting_clients, price_cents)
       VALUES ($1, $2, $3, 'Headline', 'I coach busy people through fat loss with simple strength training and habits that stick.',
               ARRAY['fat-loss']::text[], true, true, $4)`,
      [account.id, `${label}-${kit.run}`.toLowerCase(), generateReferralCode(), ready ? priceCents : null]
    );
    if (ready) {
      await pool.query(
        `INSERT INTO coach_subscriptions (coach_id, startup_fee_paid_at, startup_fee_payment_id, provider_account_id, identity_verified)
         VALUES ($1, now(), 'pay_fee', $2, true)`,
        [account.id, accountId ?? `biz_${label}_${kit.run}`]
      );
    }
    return { ...account, slug: `${label}-${kit.run}`.toLowerCase() };
  };

  kit.makeAdmin = async (label = 'admin') => {
    const account = await kit.register(label);
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [account.id]);
    return account;
  };

  // A student whose request the coach has accepted (link is pending_payment).
  // Returns the link id.
  kit.acceptedLink = async (coach, student) => {
    const res = await kit.call(student, 'POST', '/coach-link/requests', { coachSlug: coach.slug });
    assert.equal(res.status, 201);
    const { request } = await res.json();
    const accept = await kit.call(coach, 'POST', `/coach/requests/${request.id}/accept`);
    assert.equal(accept.status, 200, 'accept should work for a ready coach');
    return request.id;
  };

  // Delivers a signed webhook. `type` is the provider's own event name.
  let counter = 0;
  kit.webhook = (type, fields = {}, { id, secret = WEBHOOK_SECRET, timestamp, account } = {}) => {
    counter += 1;
    const eventId = id ?? `msg_${kit.run}_${counter}`;
    const body = buildFakeEvent(type, fields, { id: eventId, ...(account ? { account_id: account } : {}) });
    return fetch(`${kit.baseUrl}/billing/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...signTestWebhook(body, secret, { id: eventId, timestamp }) },
      body,
    });
  };

  return kit;
}
