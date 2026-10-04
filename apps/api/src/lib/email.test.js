// Email: captured in development and tests, never sent; only a real send in
// production with both keys set. No network.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { isEmailEnabled, sendEmail, getCapturedEmails, clearCapturedEmails } from './email.js';

beforeEach(() => clearCapturedEmails());

const message = {
  to: 'aisha@example.com',
  subject: 'Reset your Cut password',
  text: 'Open https://cut.example.com/reset?token=SECRETTOKEN to choose a new password.',
};

function refusingFetch() {
  return async () => {
    throw new Error('the network must not be used here');
  };
}

test('dormant without both variables', () => {
  assert.equal(isEmailEnabled({}), false);
  assert.equal(isEmailEnabled({ RESEND_API_KEY: 're_x' }), false);
  assert.equal(isEmailEnabled({ EMAIL_FROM: 'a@b.co' }), false);
  assert.equal(isEmailEnabled({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'Cut <a@b.co>' }), true);
});

test('outside production the message is captured and never sent', async () => {
  const env = { NODE_ENV: 'test', RESEND_API_KEY: 're_x', EMAIL_FROM: 'a@b.co' };
  const result = await sendEmail(message, { env, fetch: refusingFetch() });
  assert.deepEqual(result, { sent: false, captured: true });
  const [kept] = getCapturedEmails();
  assert.equal(kept.to, message.to);
  assert.equal(kept.subject, message.subject);
  assert.equal(kept.text, message.text);
});

test('with no keys at all it is still captured outside production', async () => {
  const result = await sendEmail(message, { env: {}, fetch: refusingFetch() });
  assert.equal(result.captured, true);
  assert.equal(getCapturedEmails().length, 1);
});

test('the log line never contains the body, its link or its token', async () => {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    await sendEmail(message, { env: {}, fetch: refusingFetch() });
  } finally {
    console.log = original;
  }
  const logged = lines.join('\n');
  assert.ok(logged.includes('Email captured'));
  for (const hidden of ['SECRETTOKEN', 'https://', 'aisha@example.com']) {
    assert.ok(!logged.includes(hidden), hidden);
  }
});

test('the capture list is a copy and can be cleared', async () => {
  await sendEmail(message, { env: {} });
  getCapturedEmails()[0].subject = 'tampered';
  assert.equal(getCapturedEmails()[0].subject, message.subject);
  clearCapturedEmails();
  assert.deepEqual(getCapturedEmails(), []);
});

test('production with no keys sends nothing and keeps nothing', async () => {
  const result = await sendEmail(message, { env: { NODE_ENV: 'production' }, fetch: refusingFetch() });
  assert.deepEqual(result, { sent: false, captured: false, reason: 'dormant' });
  assert.equal(getCapturedEmails().length, 0);
});

test('production with keys makes one authorised call to the email service', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, ...init, body: JSON.parse(init.body) });
    return { ok: true, status: 200 };
  };
  const env = { NODE_ENV: 'production', RESEND_API_KEY: 're_KEY', EMAIL_FROM: 'Cut <hi@cut.example.com>' };
  const result = await sendEmail(message, { env, fetch: fetchImpl });
  assert.deepEqual(result, { sent: true, captured: false });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.resend.com/emails');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].headers.Authorization, 'Bearer re_KEY');
  assert.deepEqual(requests[0].body, { from: 'Cut <hi@cut.example.com>', to: [message.to], subject: message.subject, text: message.text });
  assert.ok(requests[0].signal instanceof AbortSignal);
  assert.equal(getCapturedEmails().length, 0);
});

test('a refusal or a dropped connection never throws and never leaks', async () => {
  const env = { NODE_ENV: 'production', RESEND_API_KEY: 're_KEY', EMAIL_FROM: 'a@b.co' };
  const refused = await sendEmail(message, { env, fetch: async () => ({ ok: false, status: 422 }) });
  assert.deepEqual(refused, { sent: false, captured: false, reason: 'failed' });
  const down = await sendEmail(message, { env, fetch: async () => { throw new Error('re_KEY exploded'); } });
  assert.deepEqual(down, { sent: false, captured: false, reason: 'failed' });
});

test('bad addresses, subjects and bodies are refused before anything happens', async () => {
  const ok = { ...message };
  for (const bad of [
    { to: 'nope' },
    { to: 'a@b.co, c@d.co' },
    { to: 'a@b.co\nBcc: x@y.co' },
    { to: undefined },
    { subject: '' },
    { subject: 'Hi\nBcc: x@y.co' },
    { text: '' },
    { text: 5 },
  ]) {
    const result = await sendEmail({ ...ok, ...bad }, { env: {}, fetch: refusingFetch() });
    assert.equal(result.sent, false);
    assert.equal(result.captured, false);
  }
  assert.equal(getCapturedEmails().length, 0);
});

test('the capture list is capped so memory cannot grow forever', async () => {
  for (let i = 0; i < 250; i += 1) await sendEmail({ ...message, subject: `n${i}` }, { env: {} });
  const kept = getCapturedEmails();
  assert.equal(kept.length, 200);
  assert.equal(kept.at(-1).subject, 'n249');
});
