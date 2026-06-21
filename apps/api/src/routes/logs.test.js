import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;
let cookie;
let habitId;
let activityId;
let injuryId;

before(async () => {
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

after(async () => {
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
