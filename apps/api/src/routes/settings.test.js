import assert from 'node:assert/strict';
import { afterAll, beforeAll, test } from 'vitest';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;
let cookie;

beforeAll(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;

  const email = `settings-test-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Settings Test' }),
  });
  cookie = registerRes.headers.get('set-cookie').split(';')[0];
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

function put(body) {
  return fetch(`${baseUrl}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
}

test('PUT /settings saves a valid profile', async () => {
  const res = await put({
    startWeight: 90,
    targetWeight: 80,
    targetDate: '2026-12-31',
    height: 180,
    age: 35,
    stepGoal: 10000,
    sleepGoal: 8,
    daysPerWeek: 4,
  });
  assert.equal(res.status, 200);
  const { settings } = await res.json();
  assert.equal(Number(settings.age), 35);
  assert.equal(settings.daysPerWeek, 4);
});

test('PUT /settings rejects bad numbers and dates with a clean 400', async () => {
  const badBodies = [
    { age: -5 },                 // negative
    { age: 'old' },              // not a number
    { startWeight: -10 },        // negative weight
    { height: 999999 },          // absurdly large
    { daysPerWeek: 30 },         // out of the 0-7 range
    { targetDate: '2026-13-45' },// impossible date
    { targetDate: 'soon' },      // not a date
  ];
  for (const body of badBodies) {
    const res = await put(body);
    assert.equal(res.status, 400, `${JSON.stringify(body)} should be rejected`);
    const json = await res.json();
    assert.equal(json.error.code, 'INVALID_INPUT');
  }
});

test('PUT /settings never stored a bad value', async () => {
  // After all the rejected writes above, the saved profile is still the good one.
  const res = await fetch(`${baseUrl}/settings`, { headers: { Cookie: cookie } });
  const { settings } = await res.json();
  assert.equal(Number(settings.age), 35);
});
