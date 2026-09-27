// Signing up through a coach's referral link. The invite gate is switched ON
// for this file (a fresh code set before the app loads, as rateLimit.test.js
// does for its flag): a valid referral code stands in for the invite code, a
// wrong one does not, and a closed app stays closed.
const INVITE_CODE = `referral-test-${Date.now()}`;
process.env.SIGNUP_INVITE_CODES = INVITE_CODE;
process.env.SIGNUPS_OPEN = '';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';
import { generateReferralCode } from '../lib/coachProfiles.js';

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

function registerRaw(label, extra = {}) {
  return fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `auth-referral-${label}-${run}@example.com`,
      password: 'hunter2pass',
      displayName: `${label} User`,
      ...extra,
    }),
  });
}

async function makeCoach(label, role = 'coach') {
  const res = await registerRaw(label, { inviteCode: INVITE_CODE });
  assert.equal(res.status, 201);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user } = await res.json();
  await pool.query('UPDATE users SET role = $2 WHERE id = $1', [user.id, role]);
  const code = generateReferralCode();
  await pool.query(
    `INSERT INTO coach_profiles (user_id, slug, referral_code) VALUES ($1, $2, $3)`,
    [user.id, `${label}-${run}`.toLowerCase(), code]
  );
  return { cookie, user, code };
}

test('the gate is on: no code at all is refused', async () => {
  const res = await registerRaw('nocode');
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'INVITE_REQUIRED');
});

test('a valid referral code replaces the invite code, records the coach, and creates a request', async () => {
  const coach = await makeCoach('refcoach');

  const res = await registerRaw('referred', { referralCode: coach.code.toLowerCase() });
  assert.equal(res.status, 201);
  const { user } = await res.json();
  assert.equal(user.role, 'consumer');
  const cookie = res.headers.get('set-cookie').split(';')[0];

  const { rows } = await pool.query('SELECT referred_by_coach_id FROM users WHERE id = $1', [user.id]);
  assert.equal(rows[0].referred_by_coach_id, coach.user.id);

  // The coach sees the request, marked as a referral.
  const queue = await fetch(`${baseUrl}/coach/requests`, { headers: { Cookie: coach.cookie } });
  const { requests } = await queue.json();
  const mine = requests.find((r) => r.clientId === user.id);
  assert.ok(mine);
  assert.equal(mine.requestedBy, 'referral');

  // The new student sees it as their pending request.
  const link = await (await fetch(`${baseUrl}/coach-link`, { headers: { Cookie: cookie } })).json();
  assert.equal(link.pendingRequest.id, mine.id);
  assert.equal(link.coach, null);
});

test('a garbage referral code, or a revoked coach\'s code, is refused with INVITE_REQUIRED', async () => {
  const bad = await registerRaw('garbage', { referralCode: 'NOTACODE99' });
  assert.equal(bad.status, 403);
  assert.equal((await bad.json()).error.code, 'INVITE_REQUIRED');

  const revoked = await makeCoach('revokedcoach', 'consumer');
  const res = await registerRaw('viarevoked', { referralCode: revoked.code });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'INVITE_REQUIRED');

  const weird = await registerRaw('weird', { referralCode: ['x'] });
  assert.equal(weird.status, 403);
});

test('when sign-up is closed, a referral code does not open it', async () => {
  const coach = await makeCoach('closedcoach');
  // The mode is read per request, so it can be flipped for one test.
  const saved = { codes: process.env.SIGNUP_INVITE_CODES, env: process.env.NODE_ENV };
  process.env.SIGNUP_INVITE_CODES = '';
  process.env.NODE_ENV = 'production';
  try {
    const res = await registerRaw('closed', { referralCode: coach.code });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, 'SIGNUPS_CLOSED');
  } finally {
    process.env.SIGNUP_INVITE_CODES = saved.codes;
    process.env.NODE_ENV = saved.env;
  }
});
