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

  const email = `health-sync-test-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Health Sync Test' }),
  });
  cookie = registerRes.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('POST /health-sync creates logs readable via GET /logs/:date', async () => {
  const res = await fetch(`${baseUrl}/health-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      entries: [
        { date: '2026-04-01', weight: 82, steps: 8000, calories: 2100, sleep: 7 },
        { date: '2026-04-02', weight: 81.5, steps: 9000, calories: 2200, sleep: 6.5 },
      ],
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.synced, 2);

  const getRes = await fetch(`${baseUrl}/logs/2026-04-01`, { headers: { Cookie: cookie } });
  const getBody = await getRes.json();
  assert.equal(getBody.log.weight, '82');
  assert.equal(getBody.log.steps, 8000);
  assert.equal(getBody.log.calories, 2100);
});

test('device data fills empty fields but never overwrites a manual entry', async () => {
  const date = '2026-04-05';

  // Manual entry: user typed in a weight of 80.
  await fetch(`${baseUrl}/logs/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ weight: 80 }),
  });

  // Health sync pushes weight 79 (should be ignored) and steps 5000 (should fill in).
  const syncRes = await fetch(`${baseUrl}/health-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ entries: [{ date, weight: 79, steps: 5000 }] }),
  });
  assert.equal(syncRes.status, 200);

  const getRes = await fetch(`${baseUrl}/logs/${date}`, { headers: { Cookie: cookie } });
  const body = await getRes.json();

  assert.equal(body.log.weight, '80', 'manual weight must not be overwritten by device data');
  assert.equal(body.log.steps, 5000, 'device data should fill an empty field');
});

test('POST /health-sync rejects a batch of more than 90 entries', async () => {
  const entries = Array.from({ length: 91 }, (_, i) => ({
    date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    steps: 1000,
  }));

  const res = await fetch(`${baseUrl}/health-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ entries }),
  });
  assert.equal(res.status, 400);
});
