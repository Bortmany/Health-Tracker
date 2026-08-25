// Pentest MEDIUM cluster: bad numeric/boolean/date/foreign-id input on the
// habits, activities, injuries, programs, plans and training-log routes used to
// reach Postgres and throw an unhandled 500. Every case below must now come back
// as a clean 400 (validation) or 404 (not found) — never a 500.
import assert from 'node:assert/strict';
import { afterAll, beforeAll, test } from 'vitest';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;
let cookie;
let templateId;

beforeAll(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;

  const email = `validation-sweep-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Validation Sweep' }),
  });
  cookie = registerRes.headers.get('set-cookie').split(';')[0];

  // A self-contained plan template so the plans-adopt test doesn't depend on seed data.
  const { rows } = await pool.query(
    `INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
     VALUES ($1, 'A test plan', 'calisthenics', 'beginner', 'none', 3, '{}'::jsonb, '[]'::jsonb)
     RETURNING id`,
    [`Validation sweep plan ${Date.now()}`]
  );
  templateId = rows[0].id;
});

afterAll(async () => {
  await pool.query('DELETE FROM plan_templates WHERE id = $1', [templateId]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

function post(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
}
function put(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
}
function patch(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
}
function get(path) {
  return fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
}

// A well-formed UUID that belongs to no one — the shape check passes, so it
// reaches the ownership/FK guards we're testing.
const FOREIGN_UUID = '11111111-1111-4111-8111-111111111111';
const LONG_TEXT = 'x'.repeat(5000);

// --- habits -----------------------------------------------------------------

test('POST /habits rejects a non-numeric sortOrder with 400, not 500', async () => {
  const res = await post('/habits', { label: 'Stretch', sortOrder: 'not-a-number' });
  assert.equal(res.status, 400);
});

test('POST /habits rejects an over-long label with 400, not 500', async () => {
  const res = await post('/habits', { label: LONG_TEXT });
  assert.equal(res.status, 400);
});

test('PUT /habits/:id rejects a non-boolean archived with 400, not 500', async () => {
  const created = await (await post('/habits', { label: 'Walk' })).json();
  const res = await put(`/habits/${created.habit.id}`, { archived: 'yes-please' });
  assert.equal(res.status, 400);
});

// --- activities -------------------------------------------------------------

test('POST /activities rejects a non-numeric defaultDurationMinutes with 400, not 500', async () => {
  const res = await post('/activities', { name: 'Cycling', defaultDurationMinutes: 'thirty' });
  assert.equal(res.status, 400);
});

test('PUT /activities/:id rejects an over-long name with 400, not 500', async () => {
  const created = await (await post('/activities', { name: 'Rowing' })).json();
  const res = await put(`/activities/${created.activity.id}`, { name: LONG_TEXT });
  assert.equal(res.status, 400);
});

// --- injuries ---------------------------------------------------------------

test('POST /injuries rejects an over-long region with 400, not 500', async () => {
  const res = await post('/injuries', { region: LONG_TEXT });
  assert.equal(res.status, 400);
});

test('PATCH /injuries/:id rejects a non-boolean archived with 400, not 500', async () => {
  const created = await (await post('/injuries', { region: 'Knee' })).json();
  const res = await patch(`/injuries/${created.injury.id}`, { archived: 1 });
  assert.equal(res.status, 400);
});

// --- programs (shared replaceDays) ------------------------------------------

test('POST /programs rejects a non-numeric targetSets inside a day with 400, not 500', async () => {
  const res = await post('/programs', {
    name: 'Push/Pull',
    days: [{ name: 'Day 1', exercises: [{ name: 'Bench', targetSets: 'lots', targetReps: 8 }] }],
  });
  assert.equal(res.status, 400);
});

// --- plans adopt ------------------------------------------------------------

test('POST /plans/:id/adopt rejects an impossible calendar startDate with 400, not 500', async () => {
  const res = await post(`/plans/templates/${templateId}/adopt`, { startDate: '2026-13-45' });
  assert.equal(res.status, 400);
});

// --- training logs (foreign program references) -----------------------------

test('POST /training-logs rejects a foreign/nonexistent programId with 400, not a FK 500', async () => {
  const res = await post('/training-logs', { date: '2026-03-01', programId: FOREIGN_UUID });
  assert.equal(res.status, 400);
});

test('POST /training-logs rejects a foreign/nonexistent programDayId with 400, not a FK 500', async () => {
  const res = await post('/training-logs', { date: '2026-03-02', programDayId: FOREIGN_UUID });
  assert.equal(res.status, 400);
});

// --- round 3: daily-log injury check-ins ------------------------------------

test('PUT /logs/:date rejects a non-array injuryCheckins with 400, not 500', async () => {
  const res = await put('/logs/2026-03-05', { injuryCheckins: 'nope' });
  assert.equal(res.status, 400);
});

// --- round 3: program archived boolean --------------------------------------

test('PUT /programs/:id rejects a non-boolean archived with 400, not 500', async () => {
  const created = await (await post('/programs', { name: 'Archive me' })).json();
  const res = await put(`/programs/${created.program.id}`, { archived: 'yes' });
  assert.equal(res.status, 400);
});

// --- round 3: calendar-impossible QUERY dates -------------------------------

test('GET /logs rejects a calendar-impossible from date with 400, not 500', async () => {
  const res = await get('/logs?from=2026-99-99');
  assert.equal(res.status, 400);
});

test('GET /logs/habit-summary rejects a calendar-impossible to date with 400, not 500', async () => {
  const res = await get('/logs/habit-summary?to=2026-02-30');
  assert.equal(res.status, 400);
});

test('GET /nutrition rejects a calendar-impossible from date with 400, not 500', async () => {
  const res = await get('/nutrition?from=2026-13-01');
  assert.equal(res.status, 400);
});

test('GET /training-logs rejects a calendar-impossible from date with 400, not 500', async () => {
  const res = await get('/training-logs?from=2026-00-10');
  assert.equal(res.status, 400);
});

// --- round 3: exercise-history before= uuid ---------------------------------

test('GET /training-logs/exercise-history rejects a non-uuid before with 400, not 500', async () => {
  const res = await get('/training-logs/exercise-history?name=Bench&before=not-a-uuid');
  assert.equal(res.status, 400);
});

// --- round 3: settings enum fields ------------------------------------------

test('PUT /settings rejects an off-list experienceLevel with 400, not 500', async () => {
  const res = await put('/settings', { experienceLevel: 'wizard' });
  assert.equal(res.status, 400);
});

test('PUT /settings rejects an off-list equipment with 400, not 500', async () => {
  const res = await put('/settings', { equipment: 'spaceship' });
  assert.equal(res.status, 400);
});

// --- round 3 sweep: array-valued query params & bad coach code ---------------

test('GET /exercises survives a repeated (array) search param — not a 500', async () => {
  const res = await get('/exercises?search=a&search=b');
  assert.notEqual(res.status, 500);
});

test('GET /plans/templates survives a repeated (array) goal param — not a 500', async () => {
  const res = await get('/plans/templates?goal=a&goal=b');
  assert.notEqual(res.status, 500);
});

test('POST /coach-link/redeem rejects a non-string code with 400, not 500', async () => {
  const res = await post('/coach-link/redeem', { code: ['abc', 'def'] });
  assert.equal(res.status, 400);
});

// --- happy path still works -------------------------------------------------

test('a well-formed program with valid targets still saves (happy path)', async () => {
  const res = await post('/programs', {
    name: 'Full body',
    days: [{ name: 'Day 1', exercises: [{ name: 'Squat', targetSets: 3, targetReps: 10 }] }],
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.program.days[0].exercises[0].targetSets, 3);
});
