// Coach dashboard v2: the "who needs me today" signals on the client list
// (last active, quiet days, this week's adherence, 28-day weight series, the
// triage sort) and the coach's private per-client notes. Cross-user checks:
// a coach only sees their own active clients, a note never leaks to another
// coach or to the student, and an ended link makes the note unreachable.
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
  const email = `coach-dash-${label}-${run}@example.com`;
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

// Same shape as the Phase 2 tests: promote the role and give the coach a profile row.
async function makeCoach(label) {
  const account = await register(label);
  await pool.query("UPDATE users SET role = 'coach' WHERE id = $1", [account.user.id]);
  await pool.query(
    `INSERT INTO coach_profiles (user_id, slug, referral_code) VALUES ($1, $2, $3)`,
    [account.user.id, `${label}-${run}`.toLowerCase(), generateReferralCode()]
  );
  return account;
}

function json(cookie, method, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Coach makes an invite code, the student redeems it → an active link.
async function link(coach, student) {
  const inviteRes = await json(coach.cookie, 'POST', '/coach/invites');
  assert.equal(inviteRes.status, 201);
  const { inviteCode } = await inviteRes.json();
  const redeemRes = await json(student.cookie, 'POST', '/coach-link/redeem', { code: inviteCode });
  assert.equal(redeemRes.status, 200);
  const { rows } = await pool.query(
    `SELECT id FROM coach_clients WHERE coach_id = $1 AND client_id = $2 AND status = 'active'`,
    [coach.user.id, student.user.id]
  );
  return rows[0].id;
}

async function listClients(coach) {
  const res = await json(coach.cookie, 'GET', '/coach/clients');
  assert.equal(res.status, 200);
  return (await res.json()).clients;
}

// Dates the way the database sees them, so the test and the server agree on "today".
async function dbDate(offsetDays) {
  const { rows } = await pool.query(`SELECT (CURRENT_DATE + $1::integer)::text AS d`, [offsetDays]);
  return rows[0].d;
}
async function dbWeekStart() {
  const { rows } = await pool.query(`SELECT date_trunc('week', CURRENT_DATE)::date::text AS d`);
  return rows[0].d;
}

test('quiet days and last active: today → 0, never → null (sorted first), 5 days ago → 5', async () => {
  const coach = await makeCoach('quietcoach');
  const active = await register('aactive');
  const never = await register('bnever');
  const stale = await register('cstale');
  await link(coach, active);
  await link(coach, never);
  await link(coach, stale);

  const today = await dbDate(0);
  const fiveAgo = await dbDate(-5);
  const logRes = await json(active.cookie, 'PUT', `/logs/${today}`, { steps: 4000 });
  assert.equal(logRes.status, 200);
  await pool.query('INSERT INTO daily_logs (user_id, date, steps) VALUES ($1, $2, 3000)', [stale.user.id, fiveAgo]);

  const clients = await listClients(coach);
  assert.deepEqual(clients.map((c) => c.displayName), ['bnever User', 'cstale User', 'aactive User']);

  const [neverRow, staleRow, activeRow] = clients;
  assert.equal(neverRow.lastActiveAt, null);
  assert.equal(neverRow.quietDays, null);
  assert.equal(staleRow.lastActiveAt, fiveAgo);
  assert.equal(staleRow.quietDays, 5);
  assert.equal(activeRow.lastActiveAt, today);
  assert.equal(activeRow.quietDays, 0);

  // Every client carries the full signal shape even when there is nothing to show.
  assert.deepEqual(neverRow.adherence, { done: 0, planned: null });
  assert.deepEqual(neverRow.weightSeries, []);
});

test('a training session or a meal also counts as being active', async () => {
  const coach = await makeCoach('anycoach');
  const lifter = await register('lifter');
  const eater = await register('eater');
  await link(coach, lifter);
  await link(coach, eater);

  const twoAgo = await dbDate(-2);
  const threeAgo = await dbDate(-3);
  await pool.query('INSERT INTO training_logs (user_id, date) VALUES ($1, $2)', [lifter.user.id, twoAgo]);
  await pool.query('INSERT INTO nutrition_logs (user_id, date, calories) VALUES ($1, $2, 2000)', [eater.user.id, threeAgo]);

  const clients = await listClients(coach);
  const byName = Object.fromEntries(clients.map((c) => [c.displayName, c]));
  assert.equal(byName['lifter User'].quietDays, 2);
  assert.equal(byName['eater User'].quietDays, 3);
  // Quietest first.
  assert.deepEqual(clients.map((c) => c.displayName), ['eater User', 'lifter User']);
});

test('adherence: sessions this week out of the days in my newest assigned program', async () => {
  const coach = await makeCoach('adhcoach');
  const student = await register('adhstudent');
  const noProgram = await register('noprogram');
  await link(coach, student);
  await link(coach, noProgram);

  const programRes = await json(coach.cookie, 'POST', `/coach/clients/${student.user.id}/programs`, {
    name: 'Four day split',
    days: [{ name: 'Push' }, { name: 'Pull' }, { name: 'Legs' }, { name: 'Upper' }],
  });
  assert.equal(programRes.status, 201);

  // Two sessions this week, one last Sunday (must not count on any day of this week).
  const monday = await dbWeekStart();
  const { rows } = await pool.query(
    `SELECT ($1::date + 1)::text AS tuesday, ($1::date - 1)::text AS last_sunday`,
    [monday]
  );
  for (const date of [monday, rows[0].tuesday, rows[0].last_sunday]) {
    await pool.query('INSERT INTO training_logs (user_id, date) VALUES ($1, $2)', [student.user.id, date]);
  }

  const clients = await listClients(coach);
  const byName = Object.fromEntries(clients.map((c) => [c.displayName, c]));
  assert.deepEqual(byName['adhstudent User'].adherence, { done: 2, planned: 4 });
  assert.deepEqual(byName['noprogram User'].adherence, { done: 0, planned: null });

  // A newer program from the same coach replaces the old count; archiving it
  // falls back to the previous one.
  const newerRes = await json(coach.cookie, 'POST', `/coach/clients/${student.user.id}/programs`, {
    name: 'Three day', days: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
  });
  const { program: newer } = await newerRes.json();
  assert.equal((await listClients(coach)).find((c) => c.clientId === student.user.id).adherence.planned, 3);
  const archiveRes = await json(coach.cookie, 'PUT', `/coach/clients/${student.user.id}/programs/${newer.id}`, { archived: true });
  assert.equal(archiveRes.status, 200);
  assert.equal((await listClients(coach)).find((c) => c.clientId === student.user.id).adherence.planned, 4);
});

test('weightSeries: last 28 days only, oldest first, no rows without a weight', async () => {
  const coach = await makeCoach('wcoach');
  const student = await register('wstudent');
  await link(coach, student);

  const d40 = await dbDate(-40);
  const d20 = await dbDate(-20);
  const d10 = await dbDate(-10);
  const d3 = await dbDate(-3);
  await pool.query('INSERT INTO daily_logs (user_id, date, weight) VALUES ($1, $2, 90)', [student.user.id, d40]);
  await pool.query('INSERT INTO daily_logs (user_id, date, weight) VALUES ($1, $2, 82.5)', [student.user.id, d3]);
  await pool.query('INSERT INTO daily_logs (user_id, date, steps) VALUES ($1, $2, 5000)', [student.user.id, d10]);
  await pool.query('INSERT INTO daily_logs (user_id, date, weight) VALUES ($1, $2, 84)', [student.user.id, d20]);

  const [row] = await listClients(coach);
  assert.deepEqual(row.weightSeries, [{ date: d20, weight: 84 }, { date: d3, weight: 82.5 }]);
  assert.equal(row.quietDays, 3);
});

test('notes: save, read back, replace, clear; too long is a 400', async () => {
  const coach = await makeCoach('notecoach');
  const student = await register('notestudent');
  await link(coach, student);
  const path = `/coach/clients/${student.user.id}/notes`;

  assert.deepEqual(await (await json(coach.cookie, 'GET', path)).json(), { note: null });

  const putRes = await json(coach.cookie, 'PUT', path, { body: 'Knee niggle — check in Thursday' });
  assert.equal(putRes.status, 200);
  const { note } = await putRes.json();
  assert.equal(note.body, 'Knee niggle — check in Thursday');
  assert.ok(note.updatedAt);

  const getRes = await json(coach.cookie, 'GET', path);
  const got = (await getRes.json()).note;
  assert.equal(got.body, 'Knee niggle — check in Thursday');
  assert.equal(got.updatedAt, note.updatedAt);

  // Saving again replaces the text (one row, no history).
  await json(coach.cookie, 'PUT', path, { body: 'Knee is fine now' });
  assert.equal((await (await json(coach.cookie, 'GET', path)).json()).note.body, 'Knee is fine now');
  const { rows } = await pool.query('SELECT COUNT(*)::integer AS n FROM coach_notes WHERE coach_id = $1', [coach.user.id]);
  assert.equal(rows[0].n, 1);

  // Whitespace-only clears it.
  const clearRes = await json(coach.cookie, 'PUT', path, { body: '   ' });
  assert.equal(clearRes.status, 200);
  assert.deepEqual(await clearRes.json(), { note: null });
  assert.deepEqual(await (await json(coach.cookie, 'GET', path)).json(), { note: null });

  const longRes = await json(coach.cookie, 'PUT', path, { body: 'x'.repeat(4001) });
  assert.equal(longRes.status, 400);
  const notTextRes = await json(coach.cookie, 'PUT', path, { body: 42 });
  assert.equal(notTextRes.status, 400);

  // A made-up id is a clean 404, not a crash.
  assert.equal((await json(coach.cookie, 'GET', '/coach/clients/not-a-uuid/notes')).status, 404);
});

test('isolation: another coach, the student, and an ended link never reach the note', async () => {
  const coachA = await makeCoach('isocoacha');
  const coachB = await makeCoach('isocoachb');
  const student = await register('isostudent');
  const other = await register('isoother');
  const linkId = await link(coachA, student);
  await link(coachB, other);
  const path = `/coach/clients/${student.user.id}/notes`;

  await json(coachA.cookie, 'PUT', path, { body: 'Private to coach A' });
  const today = await dbDate(0);
  await json(student.cookie, 'PUT', `/logs/${today}`, { weight: 80 });

  // Coach B is not linked to this student: 404 on read and write.
  assert.equal((await json(coachB.cookie, 'GET', path)).status, 404);
  assert.equal((await json(coachB.cookie, 'PUT', path, { body: 'sneaky' })).status, 404);
  // Coach B's list holds only their own client, with none of coach A's data.
  const bClients = await listClients(coachB);
  assert.deepEqual(bClients.map((c) => c.clientId), [other.user.id]);
  assert.deepEqual(bClients[0].weightSeries, []);

  // The student can't reach any coach route.
  const studentRes = await json(student.cookie, 'GET', path);
  assert.equal(studentRes.status, 403);
  assert.equal((await studentRes.json()).error.code, 'COACH_ONLY');
  assert.equal((await json(student.cookie, 'GET', '/coach/clients')).status, 403);

  // Coach A ends the link: the note is out of reach, even for coach A.
  assert.equal((await json(coachA.cookie, 'DELETE', `/coach/clients/${linkId}`)).status, 204);
  assert.equal((await json(coachA.cookie, 'GET', path)).status, 404);
  assert.equal((await json(coachA.cookie, 'PUT', path, { body: 'still mine?' })).status, 404);
  assert.deepEqual(await listClients(coachA), []);

  // The student moves to coach B: B still can't see A's note.
  await link(coachB, student);
  assert.deepEqual(await (await json(coachB.cookie, 'GET', path)).json(), { note: null });
});
