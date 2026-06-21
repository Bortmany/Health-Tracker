import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;
let cookie;

before(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;

  const email = `activities-test-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Activities Test' }),
  });
  cookie = registerRes.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('deleting an activity backfills its name onto existing log entries instead of leaving both fields null', async () => {
  const activityRes = await fetch(`${baseUrl}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Swimming' }),
  });
  const activityId = (await activityRes.json()).activity.id;

  await fetch(`${baseUrl}/logs/2026-02-01`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ activities: [{ activityId, durationMinutes: 45 }] }),
  });

  const deleteRes = await fetch(`${baseUrl}/activities/${activityId}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  });
  assert.equal(deleteRes.status, 204);

  const getRes = await fetch(`${baseUrl}/logs/2026-02-01`, { headers: { Cookie: cookie } });
  const body = await getRes.json();

  assert.equal(body.activities[0].activityId, null);
  assert.equal(body.activities[0].name, 'Swimming');
});
