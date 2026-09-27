import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

// The promise the app makes here: a brand-new account can create a habit,
// see it on the day's checklist, tick it, and have that tick still be there
// afterwards — and nobody else's account can touch it.

let server;
let baseUrl;
let cookie;
let otherCookie;
const DATE = '2026-03-04';

async function registerUser(name) {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `${name}-${Date.now()}@example.com`,
      password: 'hunter2pass',
      displayName: 'Habits Test',
    }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

before(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;
  cookie = await registerUser('habits-test');
  otherCookie = await registerUser('habits-other');
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function createHabit(label, withCookie = cookie) {
  return fetch(`${baseUrl}/habits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: withCookie },
    body: JSON.stringify({ label }),
  });
}

test('a new account starts with no habits and can add one', async () => {
  const emptyRes = await fetch(`${baseUrl}/habits`, { headers: { Cookie: cookie } });
  assert.equal(emptyRes.status, 200);
  const { habits: none } = await emptyRes.json();
  assert.equal(none.length, 0);

  const res = await createHabit('Walk 10,000 steps');
  assert.equal(res.status, 201);
  const { habit } = await res.json();
  assert.equal(habit.label, 'Walk 10,000 steps');
  assert.ok(habit.id);

  const listRes = await fetch(`${baseUrl}/habits`, { headers: { Cookie: cookie } });
  const { habits } = await listRes.json();
  assert.equal(habits.length, 1);
});

test('a habit with no name is rejected in plain English', async () => {
  const res = await createHabit('');
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error.code, 'INVALID_INPUT');
});

test('a new habit shows on the day sheet, and the tick sticks', async () => {
  const dayRes = await fetch(`${baseUrl}/logs/${DATE}`, { headers: { Cookie: cookie } });
  const day = await dayRes.json();
  assert.equal(day.habits.length, 1);
  assert.equal(day.habits[0].completed, false);

  const saveRes = await fetch(`${baseUrl}/logs/${DATE}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      weight: 82,
      habits: [{ habitId: day.habits[0].habitId, completed: true }],
    }),
  });
  assert.equal(saveRes.status, 200);

  const afterRes = await fetch(`${baseUrl}/logs/${DATE}`, { headers: { Cookie: cookie } });
  const after = await afterRes.json();
  assert.equal(after.habits[0].completed, true);
});

test('another account can neither see nor delete this habit', async () => {
  const theirsRes = await fetch(`${baseUrl}/habits`, { headers: { Cookie: otherCookie } });
  const { habits: theirs } = await theirsRes.json();
  assert.equal(theirs.length, 0);

  const mineRes = await fetch(`${baseUrl}/habits`, { headers: { Cookie: cookie } });
  const { habits: mine } = await mineRes.json();

  const res = await fetch(`${baseUrl}/habits/${mine[0].id}`, {
    method: 'DELETE',
    headers: { Cookie: otherCookie },
  });
  assert.equal(res.status, 404);

  const stillThereRes = await fetch(`${baseUrl}/habits`, { headers: { Cookie: cookie } });
  const { habits: stillThere } = await stillThereRes.json();
  assert.equal(stillThere.length, 1);
});

test('removing a habit takes it off the day sheet too', async () => {
  const listRes = await fetch(`${baseUrl}/habits`, { headers: { Cookie: cookie } });
  const { habits } = await listRes.json();

  const res = await fetch(`${baseUrl}/habits/${habits[0].id}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  });
  assert.equal(res.status, 204);

  const dayRes = await fetch(`${baseUrl}/logs/${DATE}`, { headers: { Cookie: cookie } });
  const day = await dayRes.json();
  assert.equal(day.habits.length, 0);
  // The rest of that day is untouched.
  assert.equal(Number(day.log.weight), 82);
});
