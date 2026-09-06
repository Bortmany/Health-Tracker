// A coach's own profile: read it, edit it, and the rule that a profile can
// only go public with a headline, an 80+ character bio and a specialty.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

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

async function register(role, label) {
  const email = `coach-profile-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: `${label} User` }),
  });
  assert.equal(res.status, 201);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user } = await res.json();
  if (role === 'coach') {
    await pool.query("UPDATE users SET role = 'coach' WHERE id = $1", [user.id]);
  }
  return { cookie, user };
}

function json(cookie, method, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const LONG_BIO = 'I coach busy people through fat loss with simple strength training and habits that actually stick week to week.';

test('a coach can read and edit their profile; the slug and referral link are ready-made', async () => {
  const coach = await register('coach', 'edit');

  const getRes = await json(coach.cookie, 'GET', '/coach/profile');
  assert.equal(getRes.status, 200);
  const { profile } = await getRes.json();
  assert.match(profile.slug, /^edit-user-[a-z0-9]{4}$/);
  assert.match(profile.referralCode, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.equal(profile.referralLink, `/coach/${profile.slug}?ref=${profile.referralCode}`);
  assert.equal(profile.isPublic, false);
  assert.equal(profile.acceptingClients, true);
  assert.deepEqual(profile.specialties, []);

  const putRes = await json(coach.cookie, 'PUT', '/coach/profile', {
    headline: '  Fat loss for busy parents  ',
    bio: LONG_BIO,
    specialties: ['fat-loss', 'beginners', 'fat-loss'],
    acceptingClients: false,
  });
  assert.equal(putRes.status, 200);
  const updated = (await putRes.json()).profile;
  assert.equal(updated.headline, 'Fat loss for busy parents');
  assert.equal(updated.bio, LONG_BIO);
  assert.deepEqual(updated.specialties, ['fat-loss', 'beginners']);
  assert.equal(updated.acceptingClients, false);
  assert.equal(updated.isPublic, false);
  assert.equal(updated.slug, profile.slug);

  // Fields left out keep their value.
  const partial = await json(coach.cookie, 'PUT', '/coach/profile', { isPublic: true });
  assert.equal(partial.status, 200);
  const kept = (await partial.json()).profile;
  assert.equal(kept.isPublic, true);
  assert.equal(kept.headline, 'Fat loss for busy parents');
  assert.equal(kept.acceptingClients, false);
});

test('a profile cannot go public until it is complete, and the message names what is missing', async () => {
  const coach = await register('coach', 'incomplete');

  const empty = await json(coach.cookie, 'PUT', '/coach/profile', { isPublic: true });
  assert.equal(empty.status, 400);
  let body = await empty.json();
  assert.equal(body.error.code, 'PROFILE_INCOMPLETE');
  assert.match(body.error.message, /a headline/);
  assert.match(body.error.message, /80 characters/);
  assert.match(body.error.message, /at least one specialty/);

  const shortBio = await json(coach.cookie, 'PUT', '/coach/profile', {
    headline: 'Strength', bio: 'Too short.', specialties: ['strength'], isPublic: true,
  });
  assert.equal(shortBio.status, 400);
  body = await shortBio.json();
  assert.equal(body.error.code, 'PROFILE_INCOMPLETE');
  assert.match(body.error.message, /80 characters/);
  assert.doesNotMatch(body.error.message, /headline/);

  // Nothing was saved as public by the failed attempts.
  const check = await json(coach.cookie, 'GET', '/coach/profile');
  assert.equal((await check.json()).profile.isPublic, false);

  const ok = await json(coach.cookie, 'PUT', '/coach/profile', {
    headline: 'Strength', bio: LONG_BIO, specialties: ['strength'], isPublic: true,
  });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).profile.isPublic, true);

  // Once public, removing the last specialty is refused too (the rule holds on every save).
  const strip = await json(coach.cookie, 'PUT', '/coach/profile', { specialties: [] });
  assert.equal(strip.status, 400);
  assert.equal((await strip.json()).error.code, 'PROFILE_INCOMPLETE');
});

test('invalid input is refused: unknown specialty, over-long headline, non-boolean switch', async () => {
  const coach = await register('coach', 'invalid');

  const spec = await json(coach.cookie, 'PUT', '/coach/profile', { specialties: ['yoga'] });
  assert.equal(spec.status, 400);
  assert.equal((await spec.json()).error.code, 'INVALID_INPUT');

  const notList = await json(coach.cookie, 'PUT', '/coach/profile', { specialties: 'fat-loss' });
  assert.equal(notList.status, 400);

  const long = await json(coach.cookie, 'PUT', '/coach/profile', { headline: 'x'.repeat(81) });
  assert.equal(long.status, 400);

  const bool = await json(coach.cookie, 'PUT', '/coach/profile', { isPublic: 'yes' });
  assert.equal(bool.status, 400);
});

test('a regular account gets COACH_ONLY on the profile routes', async () => {
  const consumer = await register('consumer', 'consumer');
  const getRes = await json(consumer.cookie, 'GET', '/coach/profile');
  assert.equal(getRes.status, 403);
  assert.equal((await getRes.json()).error.code, 'COACH_ONLY');
  const putRes = await json(consumer.cookie, 'PUT', '/coach/profile', { headline: 'Hi' });
  assert.equal(putRes.status, 403);
});
