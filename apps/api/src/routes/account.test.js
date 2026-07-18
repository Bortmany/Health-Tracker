import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;

const PASSWORD = 'hunter2pass';

before(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function register(label, role = 'consumer') {
  const email = `account-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, displayName: `${label} User`, role }),
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user } = await res.json();
  return { cookie, user, email };
}

// Puts one of everything in the account, tagged with a marker string so tests
// can prove exactly whose data shows up where.
async function seedData(cookie, marker) {
  const post = (path, body) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    });
  const put = (path, body) =>
    fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    });

  await post('/habits', { label: `Drink water ${marker}` });
  await post('/activities', { name: `Walking ${marker}` });
  await post('/injuries', { region: `Knee ${marker}` });
  await put('/logs/2026-05-01', { weight: 81, notes: `daily ${marker}` });
  await put('/nutrition/2026-05-01', {
    calories: 2000,
    meals: [{ name: `Oats ${marker}`, calories: 400 }],
  });
  await post('/training-logs', {
    date: '2026-05-01',
    exercises: [{ name: `Bench Press ${marker}`, sets: [{ weight: 100, reps: 5 }] }],
  });
  await post('/programs', {
    name: `Program ${marker}`,
    days: [{ name: 'Day 1', exercises: [{ name: 'Squat', targetSets: 3, targetReps: 5 }] }],
  });
}

test('GET /export returns everything the user logged, without the password hash', async () => {
  const marker = `mk${Date.now()}`;
  const { cookie, email } = await register('export-happy');
  await seedData(cookie, marker);

  const res = await fetch(`${baseUrl}/export`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.profile.email, email);
  assert.ok(body.dailyLogs.some((l) => l.date === '2026-05-01' && Number(l.weight) === 81));
  assert.ok(body.nutritionLogs.some((l) => l.meals.some((m) => m.name === `Oats ${marker}`)));
  assert.ok(
    body.trainingLogs.some((l) =>
      l.exercises.some((e) => e.name === `Bench Press ${marker}` && e.sets[0].reps === 5)
    )
  );
  assert.ok(body.programs.some((p) => p.name === `Program ${marker}`));
  assert.ok(body.injuries.some((i) => i.region === `Knee ${marker}`));
  assert.ok(body.activities.some((a) => a.name === `Walking ${marker}`));
  assert.ok(body.habits.some((h) => h.label === `Drink water ${marker}`));
  assert.ok(body.personalRecords.some((r) => r.name === `Bench Press ${marker}`));
  assert.equal(typeof body.streak, 'number');

  // The password (or its hash) must never appear anywhere in the export.
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes('password'));
  assert.ok(!raw.includes('passwordHash'));
  assert.ok(!raw.includes(PASSWORD));
});

test("one user's export never contains another user's data", async () => {
  const markerA = `iso-a-${Date.now()}`;
  const userA = await register('iso-a');
  await seedData(userA.cookie, markerA);
  const userB = await register('iso-b');

  const res = await fetch(`${baseUrl}/export`, { headers: { Cookie: userB.cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.profile.email, userB.email);
  assert.ok(!JSON.stringify(body).includes(markerA), "user A's data leaked into user B's export");
});

test('DELETE /account with a wrong or missing password deletes nothing', async () => {
  const { cookie } = await register('delete-wrong-pass');

  const wrongRes = await fetch(`${baseUrl}/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ password: 'not-the-password' }),
  });
  assert.equal(wrongRes.status, 401);
  const wrongBody = await wrongRes.json();
  assert.equal(wrongBody.error.code, 'INVALID_CREDENTIALS');

  const missingRes = await fetch(`${baseUrl}/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({}),
  });
  assert.equal(missingRes.status, 400);

  // The account is still there and still signed in.
  const meRes = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(meRes.status, 200);
});

test('DELETE /account removes the user and every row of their data', async () => {
  const marker = `del-${Date.now()}`;
  const { cookie, user, email } = await register('delete-happy');
  await seedData(cookie, marker);

  const res = await fetch(`${baseUrl}/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ password: PASSWORD }),
  });
  assert.equal(res.status, 204);

  // The old session no longer works and neither does logging back in.
  const meRes = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(meRes.status, 401);
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(loginRes.status, 401);

  // Nothing left in the database for this user, in any table.
  const userScopedTables = [
    'user_settings', 'habits', 'activities', 'injuries', 'daily_logs',
    'programs', 'training_logs', 'nutrition_logs', 'user_plans',
  ];
  for (const table of userScopedTables) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE user_id = $1`, [user.id]);
    assert.equal(rows[0].count, 0, `${table} still holds rows for the deleted user`);
  }
  const { rows: userRows } = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE id = $1', [user.id]);
  assert.equal(userRows[0].count, 0);
});

test("deleting one user's account leaves another user's data untouched", async () => {
  const markerA = `keep-a-${Date.now()}`;
  const userA = await register('keep-a');
  await seedData(userA.cookie, markerA);
  const userB = await register('keep-b');
  await seedData(userB.cookie, `gone-b-${Date.now()}`);

  const res = await fetch(`${baseUrl}/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: userB.cookie },
    body: JSON.stringify({ password: PASSWORD }),
  });
  assert.equal(res.status, 204);

  // User A can still sign in and still has everything.
  const exportRes = await fetch(`${baseUrl}/export`, { headers: { Cookie: userA.cookie } });
  assert.equal(exportRes.status, 200);
  const body = await exportRes.json();
  assert.ok(body.programs.some((p) => p.name === `Program ${markerA}`));
  assert.ok(body.dailyLogs.some((l) => l.date === '2026-05-01'));
});

test("deleting a coach keeps the clients' data and their coach-written programs", async () => {
  const coach = await register('coach-del', 'coach');
  const client = await register('client-del');

  // Link them and have the coach write the client a program.
  const inviteRes = await fetch(`${baseUrl}/coach/invites`, {
    method: 'POST',
    headers: { Cookie: coach.cookie },
  });
  const { inviteCode } = await inviteRes.json();
  await fetch(`${baseUrl}/coach-link/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: client.cookie },
    body: JSON.stringify({ code: inviteCode }),
  });
  const programRes = await fetch(`${baseUrl}/coach/clients/${client.user.id}/programs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: coach.cookie },
    body: JSON.stringify({
      name: 'Coach Written Plan',
      days: [{ name: 'Day 1', exercises: [{ name: 'Push-up', targetSets: 3, targetReps: 10 }] }],
    }),
  });
  assert.equal(programRes.status, 201);
  const { program } = await programRes.json();

  // The coach deletes their account.
  const deleteRes = await fetch(`${baseUrl}/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: coach.cookie },
    body: JSON.stringify({ password: PASSWORD }),
  });
  assert.equal(deleteRes.status, 204);

  // The client keeps the program (now no longer marked as from a coach) …
  const programsRes = await fetch(`${baseUrl}/programs`, { headers: { Cookie: client.cookie } });
  const { programs } = await programsRes.json();
  const kept = programs.find((p) => p.id === program.id);
  assert.ok(kept, 'the coach-written program must survive the coach leaving');
  assert.equal(kept.fromCoach, false);
  assert.equal(kept.days[0].exercises[0].name, 'Push-up');

  // … and the coach link is gone.
  const coachLinkRes = await fetch(`${baseUrl}/coach-link`, { headers: { Cookie: client.cookie } });
  const coachLinkBody = await coachLinkRes.json();
  assert.equal(coachLinkBody.coach, null);
});
