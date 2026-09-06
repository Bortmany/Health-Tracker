// Owner side of "Become a coach": the one-time admin grant, the review queue,
// approve / decline / revoke, and the rule that non-admins only ever see 404.
// ADMIN_EMAIL is set before the app loads; the login route reads it per request.
const ADMIN_EMAIL = `admin-${Date.now()}@example.com`;
process.env.ADMIN_EMAIL = ADMIN_EMAIL;

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;
let admin;

before(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;
  // The grant only ever fires once. Clear any admin left by an earlier local
  // run so this file's fresh admin account can be granted.
  await pool.query("UPDATE users SET is_admin = false WHERE email LIKE 'admin-%@example.com'");
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function register(label, email) {
  email = email ?? `admin-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: `${label} User` }),
  });
  assert.equal(res.status, 201);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user } = await res.json();
  return { cookie, user, email };
}

async function login(email) {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass' }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user } = await res.json();
  return { cookie, user };
}

function json(cookie, method, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const form = {
  displayName: 'Coach Sam',
  credentials: 'NASM CPT',
  yearsCoaching: 4,
  approach: 'Progressive overload.',
  agreedToTerms: true,
};

async function applyAs(cookie) {
  const res = await json(cookie, 'POST', '/coach-applications', form);
  assert.equal(res.status, 201);
  return (await res.json()).application;
}

test('the ADMIN_EMAIL account becomes admin on first login — once, ever', async () => {
  const registered = await register('admin', ADMIN_EMAIL);
  assert.equal(registered.user.isAdmin, false);

  admin = await login(ADMIN_EMAIL);
  assert.equal(admin.user.isAdmin, true);

  // Logging in again keeps it.
  const again = await login(ADMIN_EMAIL);
  assert.equal(again.user.isAdmin, true);
  const me = await (await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: again.cookie } })).json();
  assert.equal(me.user.isAdmin, true);

  // Changing ADMIN_EMAIL later never promotes a second account.
  const impostor = await register('late-admin');
  process.env.ADMIN_EMAIL = impostor.email;
  try {
    const late = await login(impostor.email);
    assert.equal(late.user.isAdmin, false);
  } finally {
    process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  }
});

test('/api/health reports the admin switch as configured', async () => {
  const health = await (await fetch(`${baseUrl}/health`)).json();
  assert.equal(health.admin, 'configured');
});

test('a non-admin gets a plain 404 on every admin route', async () => {
  const user = await register('non-admin');
  const fakeId = '00000000-0000-4000-8000-000000000000';
  const probes = [
    ['GET', '/admin/coach-applications'],
    ['POST', `/admin/coach-applications/${fakeId}/approve`],
    ['POST', `/admin/coach-applications/${fakeId}/decline`],
    ['GET', '/admin/coaches'],
    ['POST', `/admin/coaches/${fakeId}/revoke`],
  ];
  for (const [method, path] of probes) {
    const res = await json(user.cookie, method, path, method === 'POST' ? {} : undefined);
    assert.equal(res.status, 404, `${method} ${path}`);
    const body = await res.json();
    assert.deepEqual(body, { error: { message: 'Not found', code: 'NOT_FOUND' } });
  }
});

test('approve: the applicant becomes a coach and appears in the coaches list', async () => {
  const applicant = await register('approve-me');
  const application = await applyAs(applicant.cookie);

  const listRes = await json(admin.cookie, 'GET', '/admin/coach-applications');
  assert.equal(listRes.status, 200);
  const { applications } = await listRes.json();
  const listed = applications.find((a) => a.id === application.id);
  assert.ok(listed, 'pending application is in the queue');
  assert.equal(listed.applicantEmail, applicant.email);
  assert.equal(listed.applicantName, 'approve-me User');
  assert.equal(listed.status, 'pending');

  const badStatus = await json(admin.cookie, 'GET', '/admin/coach-applications?status=weird');
  assert.equal(badStatus.status, 400);

  const approve = await json(admin.cookie, 'POST', `/admin/coach-applications/${application.id}/approve`, {});
  assert.equal(approve.status, 200);
  const approved = (await approve.json()).application;
  assert.equal(approved.status, 'approved');
  assert.equal(approved.decidedAt.slice(0, 10), new Date().toISOString().slice(0, 10));

  const me = await (await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: applicant.cookie } })).json();
  assert.equal(me.user.role, 'coach');

  // Approval also creates the coach's profile (private by default), with the
  // credentials and years carried over from the application for display.
  const profile = (await (await json(applicant.cookie, 'GET', '/coach/profile')).json()).profile;
  assert.match(profile.slug, /^coach-sam-[a-z0-9]{4}$/);
  assert.match(profile.referralCode, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.equal(profile.isPublic, false);
  assert.equal(profile.credentials, application.credentials);
  assert.equal(profile.yearsCoaching, application.yearsCoaching);

  const coaches = (await (await json(admin.cookie, 'GET', '/admin/coaches')).json()).coaches;
  const coach = coaches.find((c) => c.userId === applicant.user.id);
  assert.ok(coach);
  assert.equal(coach.email, applicant.email);
  assert.equal(coach.coachingSince.slice(0, 10), approved.decidedAt.slice(0, 10));

  // Approving twice is a "not found" — it is no longer pending.
  const twice = await json(admin.cookie, 'POST', `/admin/coach-applications/${application.id}/approve`, {});
  assert.equal(twice.status, 404);

  // The applicant's own view shows approved and no reapply.
  const mine = await (await json(applicant.cookie, 'GET', '/coach-applications/mine')).json();
  assert.equal(mine.application.status, 'approved');
  assert.equal(mine.canReapply, false);
});

test('decline: one reapply is allowed, a second decline locks it', async () => {
  const applicant = await register('decline-me');
  const first = await applyAs(applicant.cookie);

  const tooLong = await json(admin.cookie, 'POST', `/admin/coach-applications/${first.id}/decline`, { reason: 'x'.repeat(301) });
  assert.equal(tooLong.status, 400);

  const decline = await json(admin.cookie, 'POST', `/admin/coach-applications/${first.id}/decline`, { reason: 'Please add your certification.' });
  assert.equal(decline.status, 200);
  assert.equal((await decline.json()).application.status, 'declined');

  let mine = await (await json(applicant.cookie, 'GET', '/coach-applications/mine')).json();
  assert.equal(mine.application.status, 'declined');
  assert.equal(mine.application.decisionReason, 'Please add your certification.');
  assert.equal(mine.canReapply, true);

  const second = await applyAs(applicant.cookie);
  assert.equal(second.status, 'pending');
  mine = await (await json(applicant.cookie, 'GET', '/coach-applications/mine')).json();
  assert.equal(mine.application.id, second.id);

  const declineAgain = await json(admin.cookie, 'POST', `/admin/coach-applications/${second.id}/decline`, {});
  assert.equal(declineAgain.status, 200);
  assert.equal((await declineAgain.json()).application.decisionReason, null);

  mine = await (await json(applicant.cookie, 'GET', '/coach-applications/mine')).json();
  assert.equal(mine.application.status, 'declined');
  assert.equal(mine.canReapply, false);

  const third = await json(applicant.cookie, 'POST', '/coach-applications', form);
  assert.equal(third.status, 403);
  assert.equal((await third.json()).error.code, 'REAPPLY_LIMIT');

  // The declined ones show up under status=declined and status=all.
  const declined = (await (await json(admin.cookie, 'GET', '/admin/coach-applications?status=declined')).json()).applications;
  assert.equal(declined.filter((a) => a.id === first.id || a.id === second.id).length, 2);
});

test('revoke: the coach loses access, the client keeps every log and program', async () => {
  const coach = await register('revoke-coach');
  const client = await register('revoke-client');
  const application = await applyAs(coach.cookie);
  assert.equal((await json(admin.cookie, 'POST', `/admin/coach-applications/${application.id}/approve`, {})).status, 200);

  // Coach invites, client redeems.
  const inviteRes = await json(coach.cookie, 'POST', '/coach/invites');
  assert.equal(inviteRes.status, 201);
  const { inviteCode } = await inviteRes.json();
  const redeem = await json(client.cookie, 'POST', '/coach-link/redeem', { code: inviteCode });
  assert.equal(redeem.status, 200);

  // Client logs a weight; coach assigns a program.
  const today = new Date().toISOString().slice(0, 10);
  const logRes = await json(client.cookie, 'PUT', `/logs/${today}`, { weight: 180.5 });
  assert.equal(logRes.status, 200);
  const programRes = await json(coach.cookie, 'POST', `/coach/clients/${client.user.id}/programs`, {
    name: 'Coach Plan',
    days: [{ name: 'Day 1', exercises: [{ name: 'Push-up', targetSets: 3, targetReps: 10 }] }],
  });
  assert.equal(programRes.status, 201);
  const { program } = await programRes.json();

  const revoke = await json(admin.cookie, 'POST', `/admin/coaches/${coach.user.id}/revoke`, {});
  assert.equal(revoke.status, 200);
  assert.deepEqual(await revoke.json(), { userId: coach.user.id, revoked: true });

  // Coach access ends immediately.
  const clientsRes = await fetch(`${baseUrl}/coach/clients`, { headers: { Cookie: coach.cookie } });
  assert.equal(clientsRes.status, 403);
  assert.equal((await clientsRes.json()).error.code, 'COACH_ONLY');
  const me = await (await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: coach.cookie } })).json();
  assert.equal(me.user.role, 'consumer');

  // The client's own data is untouched.
  const log = await (await fetch(`${baseUrl}/logs/${today}`, { headers: { Cookie: client.cookie } })).json();
  assert.equal(Number(log.log.weight), 180.5);
  const { programs } = await (await fetch(`${baseUrl}/programs`, { headers: { Cookie: client.cookie } })).json();
  assert.ok(programs.some((p) => p.id === program.id));

  // The link is marked revoked, not deleted.
  const { rows } = await pool.query(
    'SELECT status FROM coach_clients WHERE coach_id = $1 AND client_id = $2',
    [coach.user.id, client.user.id]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'revoked');
  const myCoach = await (await fetch(`${baseUrl}/coach-link`, { headers: { Cookie: client.cookie } })).json();
  assert.equal(myCoach.coach, null);

  // Revoking someone who is not a coach is a "not found".
  const again = await json(admin.cookie, 'POST', `/admin/coaches/${coach.user.id}/revoke`, {});
  assert.equal(again.status, 404);
  const coaches = (await (await json(admin.cookie, 'GET', '/admin/coaches')).json()).coaches;
  assert.ok(!coaches.some((c) => c.userId === coach.user.id));
});
