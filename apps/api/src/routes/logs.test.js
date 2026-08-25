import assert from 'node:assert/strict';
import { afterAll, beforeAll, test } from 'vitest';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;
let cookie;
let habitId;
let activityId;
let injuryId;

beforeAll(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;

  const email = `logs-test-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Logs Test' }),
  });
  cookie = registerRes.headers.get('set-cookie').split(';')[0];

  const habitRes = await fetch(`${baseUrl}/habits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ label: 'Stretch' }),
  });
  habitId = (await habitRes.json()).habit.id;

  const activityRes = await fetch(`${baseUrl}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Walk' }),
  });
  activityId = (await activityRes.json()).activity.id;

  const injuryRes = await fetch(`${baseUrl}/injuries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ region: 'shoulder' }),
  });
  injuryId = (await injuryRes.json()).injury.id;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('PUT /logs/:date creates a log with nested habits, activities, and injury check-ins', async () => {
  const res = await fetch(`${baseUrl}/logs/2026-01-15`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      weight: 90,
      habits: [{ habitId, completed: true }],
      activities: [{ activityId, durationMinutes: 30 }],
      injuryCheckins: [{ injuryId, painPre: 4, swelling: true }],
    }),
  });
  assert.equal(res.status, 200);

  const getRes = await fetch(`${baseUrl}/logs/2026-01-15`, { headers: { Cookie: cookie } });
  const body = await getRes.json();

  assert.equal(body.log.weight, '90');
  assert.equal(body.habits.find((h) => h.habitId === habitId).completed, true);
  assert.equal(body.activities[0].activityId, activityId);
  assert.equal(body.injuryCheckins.find((c) => c.injuryId === injuryId).painPre, 4);
});

test('PUT /logs/:date on an existing date replaces child rows rather than appending', async () => {
  await fetch(`${baseUrl}/logs/2026-01-16`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ habits: [{ habitId, completed: true }], activities: [{ activityId, durationMinutes: 10 }] }),
  });

  await fetch(`${baseUrl}/logs/2026-01-16`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ habits: [{ habitId, completed: false }], activities: [{ name: 'Freeform run', durationMinutes: 20 }] }),
  });

  const getRes = await fetch(`${baseUrl}/logs/2026-01-16`, { headers: { Cookie: cookie } });
  const body = await getRes.json();

  assert.equal(body.habits.find((h) => h.habitId === habitId).completed, false);
  assert.equal(body.activities.length, 1);
  assert.equal(body.activities[0].name, 'Freeform run');
});

test('GET /logs/habit-summary returns per-day habit completion counts', async () => {
  const res = await fetch(`${baseUrl}/logs/habit-summary?from=2026-01-15&to=2026-01-16`, {
    headers: { Cookie: cookie },
  });
  assert.equal(res.status, 200);
  const { days } = await res.json();

  assert.equal(days.length, 2);
  const day1 = days.find((d) => d.date.startsWith('2026-01-15'));
  assert.equal(day1.possible, 1);
  assert.equal(day1.completed, 1);
  const day2 = days.find((d) => d.date.startsWith('2026-01-16'));
  assert.equal(day2.completed, 0);
});

test('registering with a short password is rejected', async () => {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `weak-${Date.now()}@example.com`, password: 'short', displayName: 'Weak' }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'WEAK_PASSWORD');
});

test('PUT /logs/:date rejects an impossible date instead of crashing', async () => {
  const res = await fetch(`${baseUrl}/logs/2026-13-45`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ weight: 90 }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'INVALID_INPUT');
});

test('PUT /logs/:date rejects out-of-range and infinite numbers', async () => {
  // Raw bodies (not JSON.stringify, which turns Infinity into null): the "1e400"
  // token parses to Infinity server-side, the exact value that used to be stored
  // and break the chart. Each of these must be rejected with a 400.
  for (const body of ['{"weight":"heavy"}', '{"weight":-5}', '{"steps":1e400}', '{"weight":999999}']) {
    const res = await fetch(`${baseUrl}/logs/2026-01-20`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body,
    });
    assert.equal(res.status, 400, `expected ${body} to be rejected`);
  }
});

test('GET /logs/:date with a non-date is a clean 400, never a 500', async () => {
  const res = await fetch(`${baseUrl}/logs/not-a-date`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 400);
});

test('PUT /logs/:date rejects a valid-shaped but non-existent habitId with a clean 4xx, not a 500', async () => {
  const unknownHabitId = '11111111-2222-3333-4444-555555555555';
  const res = await fetch(`${baseUrl}/logs/2026-01-21`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ habits: [{ habitId: unknownHabitId, completed: true }] }),
  });
  assert.ok(res.status >= 400 && res.status < 500, `expected a clean 4xx, got ${res.status}`);
  const body = await res.json();
  assert.ok(body.error);
});

test('PUT /logs/:date rejects an out-of-range pain score instead of silently discarding it', async () => {
  const res = await fetch(`${baseUrl}/logs/2026-01-22`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ injuryCheckins: [{ injuryId, painPre: 999 }] }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error.message, /between 0 and 10/);
});

test('PUT /logs/:date rejects a wrong-type swelling value instead of silently coercing it', async () => {
  const res = await fetch(`${baseUrl}/logs/2026-01-23`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ injuryCheckins: [{ injuryId, swelling: 'yes' }] }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error.message, /true or false/);
});

test('a malformed JSON body returns the standard error envelope, not a raw echoed string', async () => {
  const res = await fetch(`${baseUrl}/logs/2026-01-24`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: '{not valid json',
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'INVALID_JSON');
});

test('a second user cannot read another user\'s log for the same date', async () => {
  const email = `logs-test-other-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Other' }),
  });
  const otherCookie = registerRes.headers.get('set-cookie').split(';')[0];

  const getRes = await fetch(`${baseUrl}/logs/2026-01-15`, { headers: { Cookie: otherCookie } });
  const body = await getRes.json();

  assert.equal(body.log, null);
});
