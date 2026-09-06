// The public coach directory: only public profiles of current coaches are
// listed, never with an email or user id; private profiles answer 404 by
// slug; a referral code resolves even for a private coach.
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

async function register(label) {
  const email = `coaches-public-${label}-${run}@example.com`;
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: `${label} Coach` }),
  });
  assert.equal(res.status, 201);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user } = await res.json();
  return { cookie, user, email };
}

// Promote to coach and insert a profile row directly with a known slug/code
// (the approve route does the same insert through ensureCoachProfile).
async function makeCoach(label, { isPublic, specialties = ['fat-loss'], role = 'coach' } = {}) {
  const account = await register(label);
  await pool.query('UPDATE users SET role = $2 WHERE id = $1', [account.user.id, role]);
  const slug = `${label}-${run}`.toLowerCase();
  const code = generateReferralCode();
  await pool.query(
    `INSERT INTO coach_profiles (user_id, slug, referral_code, headline, bio, specialties, is_public)
     VALUES ($1, $2, $3, 'Headline', 'A bio long enough to be public, well over eighty characters of plain text about coaching.', $4::text[], $5)`,
    [account.user.id, slug, code, specialties, isPublic]
  );
  return { ...account, slug, code };
}

test('the directory lists only public coaches and never leaks email or id', async () => {
  const pub = await makeCoach('pubA', { isPublic: true, specialties: ['fat-loss', 'running'] });
  const priv = await makeCoach('privA', { isPublic: false });
  // A public profile whose owner is no longer a coach must not show either.
  const demoted = await makeCoach('demotedA', { isPublic: true, role: 'consumer' });

  const res = await fetch(`${baseUrl}/coaches`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=300');
  const { coaches } = await res.json();
  const slugs = coaches.map((c) => c.slug);
  assert.ok(slugs.includes(pub.slug));
  assert.ok(!slugs.includes(priv.slug));
  assert.ok(!slugs.includes(demoted.slug));

  const raw = JSON.stringify(coaches);
  assert.ok(!raw.includes(pub.email));
  assert.ok(!raw.includes(pub.user.id));
  assert.ok(!raw.includes(pub.code));
  const mine = coaches.find((c) => c.slug === pub.slug);
  assert.deepEqual(Object.keys(mine).sort(), ['acceptingClients', 'credentials', 'displayName', 'headline', 'link', 'slug', 'specialties', 'yearsCoaching']);
  assert.equal(mine.acceptingClients, true);
});

test('the directory filters by specialty and rejects an unknown one', async () => {
  const runner = await makeCoach('runnerB', { isPublic: true, specialties: ['running'] });
  const lifter = await makeCoach('lifterB', { isPublic: true, specialties: ['strength'] });

  const res = await fetch(`${baseUrl}/coaches?specialty=running`);
  const { coaches } = await res.json();
  const slugs = coaches.map((c) => c.slug);
  assert.ok(slugs.includes(runner.slug));
  assert.ok(!slugs.includes(lifter.slug));

  const bad = await fetch(`${baseUrl}/coaches?specialty=yoga`);
  assert.equal(bad.status, 400);
  const body = await bad.json();
  assert.equal(body.error.code, 'INVALID_INPUT');
});

test('a coach page shows a public profile with bio and 404s for a private one', async () => {
  const pub = await makeCoach('pageC', { isPublic: true });
  const priv = await makeCoach('hiddenC', { isPublic: false });

  const res = await fetch(`${baseUrl}/coaches/${pub.slug}`);
  assert.equal(res.status, 200);
  const { coach } = await res.json();
  assert.equal(coach.displayName, 'pageC Coach');
  assert.equal(coach.slug, pub.slug);
  assert.ok(coach.bio.length > 80);
  assert.equal(coach.credentials, null);
  assert.ok(!JSON.stringify(coach).includes(pub.email));

  const hidden = await fetch(`${baseUrl}/coaches/${priv.slug}`);
  assert.equal(hidden.status, 404);
  const missing = await fetch(`${baseUrl}/coaches/no-such-coach-${run}`);
  assert.equal(missing.status, 404);
});

test('a referral code resolves for a private coach and 404s for garbage', async () => {
  const priv = await makeCoach('refD', { isPublic: false });

  const res = await fetch(`${baseUrl}/coaches/referral/${priv.code}`);
  assert.equal(res.status, 200);
  const { coach } = await res.json();
  assert.deepEqual(coach, { slug: priv.slug, displayName: 'refD Coach' });
  assert.ok(!JSON.stringify(coach).includes(priv.email));

  const bad = await fetch(`${baseUrl}/coaches/referral/NOPE${run.slice(-4)}`);
  assert.equal(bad.status, 404);
});
