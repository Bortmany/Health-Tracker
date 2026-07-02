import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;
let cookie;
let exerciseLibraryId;

const exerciseName = `Test Zercher Squat ${Date.now()}`;

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

before(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;

  const email = `consumer-polish-test-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Consumer Polish Test' }),
  });
  cookie = registerRes.headers.get('set-cookie').split(';')[0];

  const { rows } = await pool.query(
    `INSERT INTO exercise_library (name, muscle_group, equipment, instructions)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [exerciseName, 'Legs', 'Barbell', 'Squat with a zercher hold.']
  );
  exerciseLibraryId = rows[0].id;
});

after(async () => {
  await pool.query('DELETE FROM exercise_library WHERE id = $1', [exerciseLibraryId]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('GET /exercises?search= finds the inserted exercise', async () => {
  const res = await fetch(`${baseUrl}/exercises?search=${encodeURIComponent('Zercher Squat')}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(res.status, 200);
  const body = await res.json();

  const match = body.exercises.find((e) => e.id === exerciseLibraryId);
  assert.ok(match, 'expected inserted exercise to be found');
  assert.equal(match.name, exerciseName);
  assert.equal(match.muscleGroup, 'Legs');
  assert.equal(match.equipment, 'Barbell');
  assert.equal(match.instructions, 'Squat with a zercher hold.');
});

test('GET /training-logs/personal-records returns the heaviest set per exercise', async () => {
  const name = `PR Bench Press ${Date.now()}`;

  await fetch(`${baseUrl}/training-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      date: '2026-04-01',
      exercises: [
        {
          name,
          sets: [
            { setNumber: 1, weight: 100, reps: 8 },
            { setNumber: 2, weight: 140, reps: 3 },
          ],
        },
      ],
    }),
  });

  const res = await fetch(`${baseUrl}/training-logs/personal-records`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();

  const record = body.records.find((r) => r.name === name);
  assert.ok(record, 'expected a personal record for the exercise');
  assert.equal(Number(record.weight), 140);
  assert.equal(record.reps, 3);
});

test('GET /logs/streak returns 2 after logging today and yesterday', async () => {
  const email = `streak-test-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Streak Test' }),
  });
  const streakCookie = registerRes.headers.get('set-cookie').split(';')[0];

  const today = new Date();
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  for (const date of [toDateString(yesterday), toDateString(today)]) {
    await fetch(`${baseUrl}/logs/${date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: streakCookie },
      body: JSON.stringify({ weight: 180 }),
    });
  }

  const res = await fetch(`${baseUrl}/logs/streak`, { headers: { Cookie: streakCookie } });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.streak, 2);
});

test('a second user cannot see another user\'s exercise history in personal records', async () => {
  const email = `pr-isolation-test-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'PR Isolation' }),
  });
  const otherCookie = registerRes.headers.get('set-cookie').split(';')[0];

  const res = await fetch(`${baseUrl}/training-logs/personal-records`, { headers: { Cookie: otherCookie } });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.records.length, 0);
});
