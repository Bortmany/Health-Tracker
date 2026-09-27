// Applicant side of "Become a coach": apply, check status, withdraw, and the
// rules that keep one person's application invisible to everyone else.
delete process.env.ADMIN_EMAIL;

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

async function register(label) {
  const email = `coach-app-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: `${label} User` }),
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user } = await res.json();
  return { cookie, user, email };
}

const validForm = {
  displayName: 'Coach Sam',
  credentials: 'NASM CPT, 2019',
  yearsCoaching: 5,
  approach: 'Simple progressive overload, three days a week.',
  link: 'https://example.com/sam',
  agreedToTerms: true,
};

function apply(cookie, body = validForm) {
  return fetch(`${baseUrl}/coach-applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
}

function mine(cookie) {
  return fetch(`${baseUrl}/coach-applications/mine`, { headers: { Cookie: cookie } });
}

test('happy path: no application, apply, see it pending, cannot apply twice', async () => {
  const { cookie } = await register('happy');

  const empty = await (await mine(cookie)).json();
  assert.equal(empty.application, null);
  assert.equal(empty.canReapply, true);

  const created = await apply(cookie);
  assert.equal(created.status, 201);
  const { application } = await created.json();
  assert.equal(application.status, 'pending');
  assert.equal(application.displayName, 'Coach Sam');
  assert.equal(application.yearsCoaching, 5);
  assert.equal(application.link, 'https://example.com/sam');
  assert.equal(application.agreedToTerms, true);
  assert.equal(application.createdAt.slice(0, 10), new Date().toISOString().slice(0, 10));

  const status = await (await mine(cookie)).json();
  assert.equal(status.application.id, application.id);
  assert.equal(status.canReapply, false);

  const again = await apply(cookie);
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error.code, 'APPLICATION_PENDING');
});

test('validation: missing agreement, too many years, and a bad link are refused', async () => {
  const { cookie } = await register('validation');

  const noTerms = await apply(cookie, { ...validForm, agreedToTerms: false });
  assert.equal(noTerms.status, 400);
  const noTermsBody = await noTerms.json();
  assert.equal(noTermsBody.error.code, 'INVALID_INPUT');
  assert.match(noTermsBody.error.message, /agreedToTerms/);

  const tooMany = await apply(cookie, { ...validForm, yearsCoaching: 61 });
  assert.equal(tooMany.status, 400);
  assert.match((await tooMany.json()).error.message, /yearsCoaching/);

  const badLink = await apply(cookie, { ...validForm, link: 'not a link' });
  assert.equal(badLink.status, 400);
  assert.match((await badLink.json()).error.message, /link/);

  const unsafeLink = await apply(cookie, { ...validForm, link: 'javascript:alert(1)' });
  assert.equal(unsafeLink.status, 400);

  // A numeric string for years is fine; nothing was saved by the failures above.
  const ok = await apply(cookie, { ...validForm, yearsCoaching: '3', link: '' });
  assert.equal(ok.status, 201);
  const { application } = await ok.json();
  assert.equal(application.yearsCoaching, 3);
  assert.equal(application.link, null);
});

test('withdraw: deleting a pending application clears it and allows a fresh one', async () => {
  const { cookie } = await register('withdraw');
  const { application } = await (await apply(cookie)).json();

  const del = await fetch(`${baseUrl}/coach-applications/${application.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  });
  assert.equal(del.status, 204);

  const status = await (await mine(cookie)).json();
  assert.equal(status.application, null);
  assert.equal(status.canReapply, true);

  const again = await apply(cookie);
  assert.equal(again.status, 201);
});

test('cross-user: /mine is always your own, and you cannot withdraw someone else\'s', async () => {
  const a = await register('owner-a');
  const b = await register('other-b');
  const { application } = await (await apply(a.cookie)).json();

  const bMine = await (await mine(b.cookie)).json();
  assert.equal(bMine.application, null);

  const del = await fetch(`${baseUrl}/coach-applications/${application.id}`, {
    method: 'DELETE',
    headers: { Cookie: b.cookie },
  });
  assert.equal(del.status, 404);
  assert.equal((await del.json()).error.code, 'NOT_FOUND');

  const aMine = await (await mine(a.cookie)).json();
  assert.equal(aMine.application.id, application.id);

  // A malformed id is the same clean "not found", not a server error.
  const bad = await fetch(`${baseUrl}/coach-applications/not-a-uuid`, {
    method: 'DELETE',
    headers: { Cookie: a.cookie },
  });
  assert.equal(bad.status, 404);
});

test('an approved coach cannot apply again', async () => {
  const { cookie, user } = await register('approved');
  // Stand in for the admin approving: mark the application approved directly.
  await pool.query(
    `INSERT INTO coach_applications (user_id, display_name, credentials, years_coaching, approach, agreed_to_terms, status, decided_at)
     VALUES ($1, 'Coach', 'Cert', 2, 'Approach', true, 'approved', now())`,
    [user.id]
  );
  await pool.query("UPDATE users SET role = 'coach' WHERE id = $1", [user.id]);

  const res = await apply(cookie);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'REAPPLY_LIMIT');

  const status = await (await mine(cookie)).json();
  assert.equal(status.application.status, 'approved');
  assert.equal(status.canReapply, false);
});

test('/api/health reports the admin switch as dormant when ADMIN_EMAIL is unset', async () => {
  const health = await (await fetch(`${baseUrl}/health`)).json();
  assert.equal(health.admin, 'dormant');
});
