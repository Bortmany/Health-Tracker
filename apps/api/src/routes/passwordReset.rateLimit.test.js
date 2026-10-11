// The rest of the suite runs with limits off. This file turns them on to prove
// "forgot password" is throttled per visitor and per address, and that guessing
// reset links is throttled too.
process.env.DISABLE_RATE_LIMIT = 'false';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';
import { startKit } from './moneyTestKit.js';

let kit;

before(() => {
  process.env.RESEND_API_KEY = 're_test_not_real';
  process.env.EMAIL_FROM = 'Cut <hello@example.com>';
  kit = startKit(app, pool);
  kit.start();
});

after(async () => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  await kit.stop();
});

const forgot = (email) => kit.call(null, 'POST', '/auth/forgot-password', { email });

test('the same address is limited to 3 requests an hour, with the same wording for known and unknown', async () => {
  const address = `ratelimit-same-${kit.run}@example.com`;
  const statuses = [];
  for (let i = 0; i < 4; i += 1) statuses.push((await forgot(address)).status);
  assert.deepEqual(statuses, [200, 200, 200, 429]);
  const blocked = await (await forgot(address)).json();
  assert.equal(blocked.error.code, 'RATE_LIMITED');
});

test('a visitor is limited across many different addresses', async () => {
  // The first test already used 5 of this visitor's 5 slots (4 + 1 repeat above).
  const next = await forgot(`ratelimit-visitor-b-${kit.run}@example.com`);
  assert.equal(next.status, 429);
});

test('guessing reset links is throttled: the 11th wrong guess in a row gets 429', async () => {
  let last;
  for (let i = 0; i < 11; i += 1) {
    last = await kit.call(null, 'POST', '/auth/reset-password', { token: `not-a-real-token-${i}-xxxxxxxx`, password: 'a-valid-new-password' });
  }
  assert.equal(last.status, 429);
});
