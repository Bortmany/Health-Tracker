// "Forgot password": the same reply for every address, a one-hour single-use
// link that is only ever stored as a hash, and a new password that signs
// everybody out. Email is played by the in-memory capture in lib/email.js.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';
import { clearCapturedEmails, getCapturedEmails } from '../lib/email.js';
import { moneyOff, startKit } from './moneyTestKit.js';

let kit;

before(() => {
  moneyOff();
  kit = startKit(app, pool);
  kit.start();
});

after(async () => {
  moneyOff();
  await kit.stop();
});

const forgot = (email) => kit.call(null, 'POST', '/auth/forgot-password', { email });
const reset = (token, password) => kit.call(null, 'POST', '/auth/reset-password', { token, password });
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

// The reply comes first and the email follows, so wait for it.
async function emailTokenFor(address) {
  for (let i = 0; i < 100; i += 1) {
    const found = getCapturedEmails().filter((m) => m.to === address).at(-1);
    if (found) return /token=([\w-]+)/.exec(found.text)[1];
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return null;
}

function emailOn() {
  process.env.RESEND_API_KEY = 're_test_not_real';
  process.env.EMAIL_FROM = 'Cut <hello@example.com>';
}

test('with email switched off the answer is 503 EMAIL_DISABLED and nothing is stored', async () => {
  moneyOff();
  const person = await kit.register('reset-off');
  const res = await forgot(person.email);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error.code, 'EMAIL_DISABLED');
  assert.equal(body.error.message, 'Password reset is coming soon — contact us.');
  assert.equal((await pool.query('SELECT 1 FROM password_resets WHERE user_id = $1', [person.id])).rowCount, 0);
});

test('known and unknown addresses get the same reply; only the known one gets an email', async () => {
  emailOn();
  clearCapturedEmails();
  const person = await kit.register('reset-same');
  const known = await forgot(person.email);
  const unknownAddress = `nobody-${kit.run}@example.com`;
  const unknown = await forgot(unknownAddress);
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(await known.json(), await unknown.json());
  assert.ok(await emailTokenFor(person.email));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(getCapturedEmails().filter((m) => m.to === unknownAddress).length, 0);
  // A badly formed address is a plain 400, not a hint about accounts.
  assert.equal((await forgot('not an email')).status, 400);
});

test('only the hash of the token is stored, and it works exactly once', async () => {
  emailOn();
  clearCapturedEmails();
  const person = await kit.register('reset-once');
  await forgot(person.email);
  const token = await emailTokenFor(person.email);
  assert.ok(token && token.length >= 40);
  // 32 random bytes, stored only as SHA-256.
  const { rows } = await pool.query('SELECT token_hash, expires_at FROM password_resets WHERE user_id = $1', [person.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, sha(token));
  assert.notEqual(rows[0].token_hash, token);
  const minutes = (new Date(rows[0].expires_at) - Date.now()) / 60000;
  assert.ok(minutes > 55 && minutes <= 60);

  const versionBefore = (await pool.query('SELECT token_version FROM users WHERE id = $1', [person.id])).rows[0].token_version;
  const ok = await reset(token, 'a-brand-new-password');
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true });
  const versionAfter = (await pool.query('SELECT token_version FROM users WHERE id = $1', [person.id])).rows[0].token_version;
  assert.equal(versionAfter, versionBefore + 1);

  // The old session is signed out, the old password stops working, the new one works.
  assert.equal((await kit.call(person, 'GET', '/auth/me')).status, 401);
  const oldLogin = await kit.call(null, 'POST', '/auth/login', { email: person.email, password: 'hunter2pass' });
  assert.equal(oldLogin.status, 401);
  const newLogin = await kit.call(null, 'POST', '/auth/login', { email: person.email, password: 'a-brand-new-password' });
  assert.equal(newLogin.status, 200);

  // Using it again fails.
  const again = await reset(token, 'another-password-1');
  assert.equal(again.status, 400);
  assert.equal((await again.json()).error.code, 'LINK_INVALID');
});

test('two clicks at once: exactly one wins', async () => {
  emailOn();
  clearCapturedEmails();
  const person = await kit.register('reset-race');
  await forgot(person.email);
  const token = await emailTokenFor(person.email);
  const results = await Promise.all([reset(token, 'first-new-password'), reset(token, 'second-new-password')]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
});

test('an expired link, a made-up link and a short password are refused', async () => {
  emailOn();
  clearCapturedEmails();
  const person = await kit.register('reset-expiry');
  await forgot(person.email);
  const token = await emailTokenFor(person.email);

  // A too-short password is refused without using the link up.
  const weak = await reset(token, 'short');
  assert.equal(weak.status, 400);
  assert.equal((await weak.json()).error.code, 'WEAK_PASSWORD');

  await pool.query(`UPDATE password_resets SET expires_at = now() - interval '1 minute' WHERE user_id = $1`, [person.id]);
  const expired = await reset(token, 'a-valid-new-password');
  assert.equal(expired.status, 400);
  assert.equal((await expired.json()).error.code, 'LINK_INVALID');

  const madeUp = await reset(crypto.randomBytes(32).toString('base64url'), 'a-valid-new-password');
  assert.equal(madeUp.status, 400);
  assert.equal((await madeUp.json()).error.code, 'LINK_INVALID');
  assert.equal((await reset(undefined, 'a-valid-new-password')).status, 400);
  assert.equal((await reset({ $ne: 1 }, 'a-valid-new-password')).status, 400);
});

test('a newer request voids the older link', async () => {
  emailOn();
  clearCapturedEmails();
  const person = await kit.register('reset-newer');
  await forgot(person.email);
  const first = await emailTokenFor(person.email);
  clearCapturedEmails();
  await forgot(person.email);
  const second = await emailTokenFor(person.email);
  assert.notEqual(first, second);

  assert.equal((await reset(first, 'a-valid-new-password')).status, 400);
  assert.equal((await reset(second, 'a-valid-new-password')).status, 200);
});

test('one person\'s link never changes another person\'s password', async () => {
  emailOn();
  clearCapturedEmails();
  const a = await kit.register('reset-iso-a');
  const b = await kit.register('reset-iso-b');
  await forgot(a.email);
  const token = await emailTokenFor(a.email);
  assert.equal((await reset(token, 'a-valid-new-password')).status, 200);
  assert.equal((await kit.call(b, 'GET', '/auth/me')).status, 200);
  const stillWorks = await kit.call(null, 'POST', '/auth/login', { email: b.email, password: 'hunter2pass' });
  assert.equal(stillWorks.status, 200);
});

test('in production with no APP_URL no reset email is sent (never a localhost link); development still works', async () => {
  emailOn();
  const savedEnv = process.env.NODE_ENV;
  const savedUrl = process.env.APP_URL;
  const person = await kit.register('reset-prod');
  try {
    delete process.env.APP_URL;
    process.env.NODE_ENV = 'production';
    clearCapturedEmails();
    assert.equal((await forgot(person.email)).status, 200);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(getCapturedEmails().filter((m) => m.to === person.email).length, 0);

    process.env.NODE_ENV = 'test';
    clearCapturedEmails();
    assert.equal((await forgot(person.email)).status, 200);
    assert.ok(await emailTokenFor(person.email));
  } finally {
    if (savedEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedEnv;
    if (savedUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = savedUrl;
  }
});
