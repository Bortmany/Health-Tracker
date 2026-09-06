// Student requests, coach invites by email, accept/decline from both sides,
// and the rule that ending a link keeps history and the client's own data.
// Cross-user checks: a coach only sees and answers their own requests; a
// student only touches their own rows.
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
const LONG_BIO = 'I coach busy people through fat loss with simple strength training and habits that actually stick week to week.';

async function register(label) {
  const email = `coach-requests-${label}-${run}@example.com`;
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

async function makeCoach(label, { isPublic = true, accepting = true } = {}) {
  const account = await register(label);
  await pool.query("UPDATE users SET role = 'coach' WHERE id = $1", [account.user.id]);
  const slug = `${label}-${run}`.toLowerCase();
  await pool.query(
    `INSERT INTO coach_profiles (user_id, slug, referral_code, headline, bio, specialties, is_public, accepting_clients)
     VALUES ($1, $2, $3, 'Headline', $4, ARRAY['fat-loss']::text[], $5, $6)`,
    [account.user.id, slug, generateReferralCode(), LONG_BIO, isPublic, accepting]
  );
  return { ...account, slug };
}

function json(cookie, method, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function linkStatus(id) {
  const { rows } = await pool.query('SELECT status, ended_at FROM coach_clients WHERE id = $1', [id]);
  return rows[0];
}

test('student requests a coach → coach sees it → accept → active on both sides', async () => {
  const coach = await makeCoach('happycoach');
  const student = await register('happystudent');

  const reqRes = await json(student.cookie, 'POST', '/coach-link/requests', { coachSlug: coach.slug });
  assert.equal(reqRes.status, 201);
  const { request } = await reqRes.json();
  assert.equal(request.coach.displayName, 'happycoach User');
  assert.equal(request.coach.slug, coach.slug);

  // Student sees it pending.
  const mineRes = await json(student.cookie, 'GET', '/coach-link');
  const mine = await mineRes.json();
  assert.equal(mine.coach, null);
  assert.equal(mine.pendingRequest.id, request.id);
  assert.equal(mine.pendingRequest.coach.slug, coach.slug);
  assert.deepEqual(mine.coachInvites, []);

  // Coach sees it in the queue, with the student's name but no email.
  const queueRes = await json(coach.cookie, 'GET', '/coach/requests');
  assert.equal(queueRes.status, 200);
  const { requests } = await queueRes.json();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].id, request.id);
  assert.equal(requests[0].clientId, student.user.id);
  assert.equal(requests[0].displayName, 'happystudent User');
  assert.equal(requests[0].requestedBy, 'client');
  assert.ok(!JSON.stringify(requests).includes(student.email));

  const acceptRes = await json(coach.cookie, 'POST', `/coach/requests/${request.id}/accept`);
  assert.equal(acceptRes.status, 200);
  assert.deepEqual(await acceptRes.json(), { ok: true });

  const afterRes = await json(student.cookie, 'GET', '/coach-link');
  const after = await afterRes.json();
  assert.deepEqual(after.coach, { displayName: 'happycoach User', slug: coach.slug });
  assert.equal(after.pendingRequest, null);

  const clientsRes = await json(coach.cookie, 'GET', '/coach/clients');
  const { clients } = await clientsRes.json();
  assert.equal(clients.length, 1);
  assert.equal(clients[0].clientId, student.user.id);
  // The queue is empty again.
  assert.equal((await (await json(coach.cookie, 'GET', '/coach/requests')).json()).requests.length, 0);
});

test('accept is refused with CLIENT_HAS_COACH when the student got another coach meanwhile', async () => {
  const coachA = await makeCoach('racea');
  const coachB = await makeCoach('raceb');
  const student = await register('racestudent');

  const reqRes = await json(student.cookie, 'POST', '/coach-link/requests', { coachSlug: coachA.slug });
  const { request } = await reqRes.json();

  // Simulate the race window: the student becomes coach B's client by a path
  // that hasn't withdrawn their open requests yet (a direct row, as two
  // accepts landing at the same moment would produce).
  await pool.query(
    `INSERT INTO coach_clients (coach_id, client_id, status) VALUES ($1, $2, 'active')`,
    [coachB.user.id, student.user.id]
  );

  const acceptRes = await json(coachA.cookie, 'POST', `/coach/requests/${request.id}/accept`);
  assert.equal(acceptRes.status, 409);
  assert.equal((await acceptRes.json()).error.code, 'CLIENT_HAS_COACH');
  assert.equal((await linkStatus(request.id)).status, 'requested');
});

test('cross-user: coach A cannot accept or decline coach B\'s request; students cannot cancel each other\'s', async () => {
  const coachA = await makeCoach('isoa');
  const coachB = await makeCoach('isob');
  const studentX = await register('isox');
  const studentY = await register('isoy');

  const { request } = await (await json(studentX.cookie, 'POST', '/coach-link/requests', { coachSlug: coachB.slug })).json();

  // Coach A never sees it and cannot answer it.
  assert.equal((await (await json(coachA.cookie, 'GET', '/coach/requests')).json()).requests.length, 0);
  assert.equal((await json(coachA.cookie, 'POST', `/coach/requests/${request.id}/accept`)).status, 404);
  assert.equal((await json(coachA.cookie, 'POST', `/coach/requests/${request.id}/decline`)).status, 404);
  assert.equal((await json(coachA.cookie, 'POST', '/coach/requests/not-a-uuid/accept')).status, 404);

  // Student Y cannot cancel student X's request.
  assert.equal((await json(studentY.cookie, 'DELETE', `/coach-link/requests/${request.id}`)).status, 404);
  assert.equal((await linkStatus(request.id)).status, 'requested');

  // Student X can, and it is kept as declined.
  assert.equal((await json(studentX.cookie, 'DELETE', `/coach-link/requests/${request.id}`)).status, 204);
  assert.equal((await linkStatus(request.id)).status, 'declined');
  assert.equal((await (await json(studentX.cookie, 'GET', '/coach-link')).json()).pendingRequest, null);

  // Coach B can decline a request addressed to them.
  const { request: second } = await (await json(studentY.cookie, 'POST', '/coach-link/requests', { coachSlug: coachB.slug })).json();
  const declineRes = await json(coachB.cookie, 'POST', `/coach/requests/${second.id}/decline`);
  assert.equal(declineRes.status, 200);
  assert.equal((await linkStatus(second.id)).status, 'declined');
});

test('request rules: HAS_COACH, REQUEST_PENDING, NOT_ACCEPTING, private coach 404, self 400', async () => {
  const coach = await makeCoach('rulescoach');
  const other = await makeCoach('rulesother');
  const closed = await makeCoach('rulesclosed', { accepting: false });
  const hidden = await makeCoach('ruleshidden', { isPublic: false });
  const student = await register('rulesstudent');

  // A private coach cannot be requested from the directory.
  assert.equal((await json(student.cookie, 'POST', '/coach-link/requests', { coachSlug: hidden.slug })).status, 404);
  // A coach who isn't taking clients.
  const notAccepting = await json(student.cookie, 'POST', '/coach-link/requests', { coachSlug: closed.slug });
  assert.equal(notAccepting.status, 409);
  assert.equal((await notAccepting.json()).error.code, 'NOT_ACCEPTING');
  // A coach cannot request themselves.
  assert.equal((await json(coach.cookie, 'POST', '/coach-link/requests', { coachSlug: coach.slug })).status, 400);
  // Missing slug.
  assert.equal((await json(student.cookie, 'POST', '/coach-link/requests', {})).status, 400);

  // One request at a time.
  assert.equal((await json(student.cookie, 'POST', '/coach-link/requests', { coachSlug: coach.slug })).status, 201);
  const pending = await json(student.cookie, 'POST', '/coach-link/requests', { coachSlug: other.slug });
  assert.equal(pending.status, 409);
  assert.equal((await pending.json()).error.code, 'REQUEST_PENDING');

  // With an active coach, no new requests.
  const { requests } = await (await json(coach.cookie, 'GET', '/coach/requests')).json();
  await json(coach.cookie, 'POST', `/coach/requests/${requests[0].id}/accept`);
  const has = await json(student.cookie, 'POST', '/coach-link/requests', { coachSlug: other.slug });
  assert.equal(has.status, 409);
  assert.equal((await has.json()).error.code, 'HAS_COACH');
});

test('invite by email: same 202 for known and unknown addresses; a row only for known', async () => {
  const coach = await makeCoach('emailcoach');
  const student = await register('emailstudent');

  const known = await json(coach.cookie, 'POST', '/coach/invites/email', { email: student.email.toUpperCase() });
  const unknown = await json(coach.cookie, 'POST', '/coach/invites/email', { email: `nobody-${run}@example.com` });
  assert.equal(known.status, 202);
  assert.equal(unknown.status, 202);
  assert.deepEqual(await known.json(), await unknown.json());

  const bad = await json(coach.cookie, 'POST', '/coach/invites/email', { email: 'not-an-email' });
  assert.equal(bad.status, 400);

  const { rows } = await pool.query(
    `SELECT id, status, requested_by, invite_email FROM coach_clients WHERE coach_id = $1`,
    [coach.user.id]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'requested');
  assert.equal(rows[0].requested_by, 'coach');
  assert.equal(rows[0].invite_email, student.email);

  // Inviting the same person twice does not create a second row.
  await json(coach.cookie, 'POST', '/coach/invites/email', { email: student.email });
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM coach_clients WHERE coach_id = $1', [coach.user.id])).rows[0].n, 1);

  // The student sees the invite (not as their own pending request), and the
  // coach's Requests queue does not list their own invite.
  const mine = await (await json(student.cookie, 'GET', '/coach-link')).json();
  assert.equal(mine.pendingRequest, null);
  assert.equal(mine.coachInvites.length, 1);
  assert.equal(mine.coachInvites[0].id, rows[0].id);
  assert.equal(mine.coachInvites[0].coach.slug, coach.slug);
  assert.equal((await (await json(coach.cookie, 'GET', '/coach/requests')).json()).requests.length, 0);

  // Another student cannot accept or decline it.
  const stranger = await register('emailstranger');
  assert.equal((await json(stranger.cookie, 'POST', `/coach-link/invites/${rows[0].id}/accept`)).status, 404);
  assert.equal((await json(stranger.cookie, 'POST', `/coach-link/invites/${rows[0].id}/decline`)).status, 404);

  // The student accepts.
  const acceptRes = await json(student.cookie, 'POST', `/coach-link/invites/${rows[0].id}/accept`);
  assert.equal(acceptRes.status, 200);
  assert.deepEqual(await acceptRes.json(), { coach: { displayName: 'emailcoach User', slug: coach.slug } });
  assert.equal((await linkStatus(rows[0].id)).status, 'active');
});

test('accepting an invite with a coach already: 409 without replaceCurrent, switches with it', async () => {
  const oldCoach = await makeCoach('switchold');
  const newCoach = await makeCoach('switchnew');
  const student = await register('switchstudent');

  // Student is linked to the old coach via an invite code, with an assigned program.
  const { inviteCode } = await (await json(oldCoach.cookie, 'POST', '/coach/invites')).json();
  await json(student.cookie, 'POST', '/coach-link/redeem', { code: inviteCode });
  const programRes = await json(oldCoach.cookie, 'POST', `/coach/clients/${student.user.id}/programs`, {
    name: 'Old Plan', days: [{ name: 'Day 1', exercises: [{ name: 'Squat', targetSets: 3, targetReps: 5 }] }],
  });
  assert.equal(programRes.status, 201);
  const { program } = await programRes.json();
  const { rows: oldRows } = await pool.query(
    `SELECT id FROM coach_clients WHERE coach_id = $1 AND client_id = $2 AND status = 'active'`,
    [oldCoach.user.id, student.user.id]
  );

  // New coach invites by email.
  await json(newCoach.cookie, 'POST', '/coach/invites/email', { email: student.email });
  const { coachInvites } = await (await json(student.cookie, 'GET', '/coach-link')).json();
  assert.equal(coachInvites.length, 1);

  const refused = await json(student.cookie, 'POST', `/coach-link/invites/${coachInvites[0].id}/accept`);
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).error.code, 'HAS_COACH');

  const switched = await json(student.cookie, 'POST', `/coach-link/invites/${coachInvites[0].id}/accept`, { replaceCurrent: true });
  assert.equal(switched.status, 200);
  assert.equal((await switched.json()).coach.slug, newCoach.slug);

  const old = await linkStatus(oldRows[0].id);
  assert.equal(old.status, 'ended');
  assert.ok(old.ended_at);
  assert.equal((await linkStatus(coachInvites[0].id)).status, 'active');

  // The old coach's assigned program is still in the student's account.
  const { programs } = await (await json(student.cookie, 'GET', '/programs')).json();
  assert.ok(programs.some((p) => p.id === program.id));
  // The old coach no longer lists the student.
  assert.equal((await (await json(oldCoach.cookie, 'GET', '/coach/clients')).json()).clients.length, 0);

  // Declining an invite marks it declined.
  const third = await makeCoach('switchthird');
  await json(third.cookie, 'POST', '/coach/invites/email', { email: student.email });
  const again = await (await json(student.cookie, 'GET', '/coach-link')).json();
  assert.equal((await json(student.cookie, 'POST', `/coach-link/invites/${again.coachInvites[0].id}/decline`)).status, 204);
  assert.equal((await linkStatus(again.coachInvites[0].id)).status, 'declined');
});

test('ending a link from either side keeps programs, marks it ended, and re-linking later works', async () => {
  const coach = await makeCoach('endcoach');
  const student = await register('endstudent');

  // Link via request → accept.
  const { request } = await (await json(student.cookie, 'POST', '/coach-link/requests', { coachSlug: coach.slug })).json();
  await json(coach.cookie, 'POST', `/coach/requests/${request.id}/accept`);
  const { program } = await (await json(coach.cookie, 'POST', `/coach/clients/${student.user.id}/programs`, {
    name: 'Kept Plan', days: [],
  })).json();

  // Coach ends it.
  assert.equal((await json(coach.cookie, 'DELETE', `/coach/clients/${request.id}`)).status, 204);
  let row = await linkStatus(request.id);
  assert.equal(row.status, 'ended');
  assert.ok(row.ended_at);
  // Ending it twice is "not found" (it's no longer live).
  assert.equal((await json(coach.cookie, 'DELETE', `/coach/clients/${request.id}`)).status, 404);
  assert.equal((await (await json(student.cookie, 'GET', '/coach-link')).json()).coach, null);
  let { programs } = await (await json(student.cookie, 'GET', '/programs')).json();
  assert.ok(programs.some((p) => p.id === program.id));

  // Re-link the same pair (the widened index allows it after 'ended') and the student ends it.
  const { request: second } = await (await json(student.cookie, 'POST', '/coach-link/requests', { coachSlug: coach.slug })).json();
  assert.ok(second.id);
  assert.equal((await json(coach.cookie, 'POST', `/coach/requests/${second.id}/accept`)).status, 200);
  assert.equal((await json(student.cookie, 'DELETE', '/coach-link')).status, 204);
  row = await linkStatus(second.id);
  assert.equal(row.status, 'ended');
  assert.ok(row.ended_at);
  ({ programs } = await (await json(student.cookie, 'GET', '/programs')).json());
  assert.ok(programs.some((p) => p.id === program.id));
  assert.equal((await (await json(coach.cookie, 'GET', '/coach/clients')).json()).clients.length, 0);

  // Another coach cannot end this pair's link, even by id.
  const other = await makeCoach('endother');
  const { request: third } = await (await json(student.cookie, 'POST', '/coach-link/requests', { coachSlug: coach.slug })).json();
  await json(coach.cookie, 'POST', `/coach/requests/${third.id}/accept`);
  assert.equal((await json(other.cookie, 'DELETE', `/coach/clients/${third.id}`)).status, 404);
  assert.equal((await linkStatus(third.id)).status, 'active');

  // Discarding an unused invite code still works through the same route.
  const { inviteCode } = await (await json(coach.cookie, 'POST', '/coach/invites')).json();
  const { pendingInvites } = await (await json(coach.cookie, 'GET', '/coach/clients')).json();
  const invite = pendingInvites.find((i) => i.inviteCode === inviteCode);
  assert.equal((await json(coach.cookie, 'DELETE', `/coach/clients/${invite.linkId}`)).status, 204);
  assert.equal((await (await json(coach.cookie, 'GET', '/coach/clients')).json()).pendingInvites.length, 0);
});

test('redeeming an invite code withdraws the student\'s open request to another coach', async () => {
  const requested = await makeCoach('stalereq');
  const redeemed = await makeCoach('staleredeem');
  const student = await register('stalestudent');

  const { request } = await (await json(student.cookie, 'POST', '/coach-link/requests', { coachSlug: requested.slug })).json();
  assert.equal((await (await json(requested.cookie, 'GET', '/coach/requests')).json()).requests.length, 1);

  const { inviteCode } = await (await json(redeemed.cookie, 'POST', '/coach/invites')).json();
  assert.equal((await json(student.cookie, 'POST', '/coach-link/redeem', { code: inviteCode })).status, 200);

  // The request is gone from the first coach's queue and kept as declined.
  assert.equal((await (await json(requested.cookie, 'GET', '/coach/requests')).json()).requests.length, 0);
  assert.equal((await linkStatus(request.id)).status, 'declined');
  assert.equal((await (await json(student.cookie, 'GET', '/coach-link')).json()).pendingRequest, null);

  // The same happens when accepting a coach's in-app invite.
  const later = await makeCoach('stalelater');
  const inviter = await makeCoach('staleinviter');
  await json(student.cookie, 'DELETE', '/coach-link');
  const { request: second } = await (await json(student.cookie, 'POST', '/coach-link/requests', { coachSlug: later.slug })).json();
  await json(inviter.cookie, 'POST', '/coach/invites/email', { email: student.email });
  const { coachInvites } = await (await json(student.cookie, 'GET', '/coach-link')).json();
  assert.equal((await json(student.cookie, 'POST', `/coach-link/invites/${coachInvites[0].id}/accept`)).status, 200);
  assert.equal((await linkStatus(second.id)).status, 'declined');
  assert.equal((await (await json(later.cookie, 'GET', '/coach/requests')).json()).requests.length, 0);
});

test('download-my-data lists every coaching link and the referring coach, never another user\'s', async () => {
  const coach = await makeCoach('exportcoach');
  const student = await register('exportstudent');
  const other = await register('exportother');

  // Student: one request that gets declined, then an active link; referred by the coach.
  const { request } = await (await json(student.cookie, 'POST', '/coach-link/requests', { coachSlug: coach.slug })).json();
  await json(coach.cookie, 'POST', `/coach/requests/${request.id}/decline`);
  const { inviteCode } = await (await json(coach.cookie, 'POST', '/coach/invites')).json();
  await json(student.cookie, 'POST', '/coach-link/redeem', { code: inviteCode });
  await pool.query('UPDATE users SET referred_by_coach_id = $2 WHERE id = $1', [student.user.id, coach.user.id]);
  // Another user with their own link to the same coach.
  await json(coach.cookie, 'POST', '/coach/invites/email', { email: other.email });

  const body = await (await json(student.cookie, 'GET', '/export')).json();
  assert.equal(body.coach.displayName, 'exportcoach User');
  assert.equal(body.referredByCoach, 'exportcoach User');
  assert.deepEqual(
    body.coachLinks.map((l) => [l.coachName, l.status, l.requestedBy]),
    [['exportcoach User', 'declined', 'client'], ['exportcoach User', 'active', null]]
  );
  assert.ok(body.coachLinks.every((l) => 'createdAt' in l && 'endedAt' in l));

  // The other user's export has only their own row and no referrer.
  const otherBody = await (await json(other.cookie, 'GET', '/export')).json();
  assert.equal(otherBody.referredByCoach, null);
  assert.deepEqual(otherBody.coachLinks.map((l) => [l.status, l.requestedBy]), [['requested', 'coach']]);
  assert.ok(!JSON.stringify(otherBody).includes(student.email));
});
