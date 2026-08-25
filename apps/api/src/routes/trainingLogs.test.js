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

  const email = `training-logs-test-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Training Test' }),
  });
  cookie = registerRes.headers.get('set-cookie').split(';')[0];
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('POST /training-logs creates a log with nested exercises and sets', async () => {
  const res = await fetch(`${baseUrl}/training-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      date: '2026-02-01',
      exercises: [
        { name: 'Bench Press', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 7 }] },
      ],
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.trainingLog.exercises[0].name, 'Bench Press');
  assert.equal(body.trainingLog.exercises[0].sets.length, 2);
  assert.equal(body.trainingLog.exercises[0].sets[0].setNumber, 1);
});

test('GET /training-logs lists a session with how many exercises it holds', async () => {
  await fetch(`${baseUrl}/training-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      date: '2026-04-05',
      exercises: [
        { name: 'Deadlift', sets: [{ weight: 100, reps: 5 }] },
        { name: 'Pull Up', sets: [{ weight: 0, reps: 10 }] },
      ],
    }),
  });

  const listRes = await fetch(`${baseUrl}/training-logs?from=2026-04-05&to=2026-04-05`, {
    headers: { Cookie: cookie },
  });
  const { trainingLogs } = await listRes.json();

  assert.equal(trainingLogs.length, 1);
  assert.equal(trainingLogs[0].date.slice(0, 10), '2026-04-05');
  assert.equal(trainingLogs[0].exerciseCount, 2);
});

test('GET /training-logs/exercise-history returns the most recent prior entry for that exercise', async () => {
  await fetch(`${baseUrl}/training-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      date: '2026-02-08',
      exercises: [{ name: 'Bench Press', sets: [{ weight: 62.5, reps: 6 }] }],
    }),
  });
  const latestRes = await fetch(`${baseUrl}/training-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      date: '2026-02-15',
      exercises: [{ name: 'Bench Press', sets: [{ weight: 65, reps: 5 }] }],
    }),
  });
  const latestId = (await latestRes.json()).trainingLog.id;

  const historyRes = await fetch(
    `${baseUrl}/training-logs/exercise-history?name=${encodeURIComponent('Bench Press')}&before=${latestId}`,
    { headers: { Cookie: cookie } }
  );
  const body = await historyRes.json();

  assert.equal(body.entry.date.slice(0, 10), '2026-02-08');
  assert.equal(body.entry.sets[0].weight, '62.5');
});

test('a second user cannot read another user\'s training log', async () => {
  const createRes = await fetch(`${baseUrl}/training-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ date: '2026-02-20', exercises: [{ name: 'Squat', sets: [{ weight: 100, reps: 5 }] }] }),
  });
  const trainingLogId = (await createRes.json()).trainingLog.id;

  const email = `training-logs-test-other-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Other' }),
  });
  const otherCookie = registerRes.headers.get('set-cookie').split(';')[0];

  const getRes = await fetch(`${baseUrl}/training-logs/${trainingLogId}`, { headers: { Cookie: otherCookie } });
  assert.equal(getRes.status, 404);
});

test('POST /training-logs rejects negative reps and infinite weights', async () => {
  // Raw bodies so "1e400" reaches the server as Infinity (JSON.stringify would
  // flatten it to null). A negative rep count used to sneak in as a fake PR.
  for (const body of [
    '{"date":"2026-05-01","exercises":[{"name":"Curl","sets":[{"weight":10,"reps":-5}]}]}',
    '{"date":"2026-05-01","exercises":[{"name":"Curl","sets":[{"weight":1e400,"reps":8}]}]}',
    '{"date":"2026-05-01","exercises":[{"name":"Curl","sets":[{"weight":"heavy","reps":8}]}]}',
  ]) {
    const res = await fetch(`${baseUrl}/training-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body,
    });
    assert.equal(res.status, 400, `expected ${body} to be rejected`);
  }
});

test('POST /training-logs rejects an impossible date', async () => {
  const res = await fetch(`${baseUrl}/training-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ date: '2026-02-30', exercises: [] }),
  });
  assert.equal(res.status, 400);
});

test('GET /training-logs/:id with a non-UUID id is a clean 404, never a 500', async () => {
  const res = await fetch(`${baseUrl}/training-logs/not-a-real-id`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 404);
});

test('POST /training-logs twice for one day updates rather than duplicating', async () => {
  const day = '2026-06-10';
  for (const weight of [80, 85]) {
    await fetch(`${baseUrl}/training-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ date: day, exercises: [{ name: 'Squat', sets: [{ weight, reps: 5 }] }] }),
    });
  }
  const listRes = await fetch(`${baseUrl}/training-logs?from=${day}&to=${day}`, { headers: { Cookie: cookie } });
  const { trainingLogs } = await listRes.json();
  // One session per day: the second save replaced the first, not appended.
  assert.equal(trainingLogs.length, 1);
});

test('editing a program keeps past sessions linked to the matching day', async () => {
  const headers = { 'Content-Type': 'application/json', Cookie: cookie };

  const programRes = await fetch(`${baseUrl}/programs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Relink Test Program',
      days: [{ name: 'Day A', exercises: [{ name: 'Squat', targetSets: 3, targetReps: 8 }] }],
    }),
  });
  const { program } = await programRes.json();
  const oldDayId = program.days[0].id;

  const logRes = await fetch(`${baseUrl}/training-logs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      date: '2026-03-01',
      programId: program.id,
      programDayId: oldDayId,
      exercises: [{ name: 'Squat', sets: [{ weight: 80, reps: 8 }] }],
    }),
  });
  const { trainingLog } = await logRes.json();

  // Replacing the program's days used to silently unlink every past session.
  const putRes = await fetch(`${baseUrl}/programs/${program.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      days: [{ name: 'Day A', exercises: [{ name: 'Squat', targetSets: 4, targetReps: 6 }] }],
    }),
  });
  assert.equal(putRes.status, 200);
  const updated = await putRes.json();
  const newDayId = updated.program.days[0].id;
  assert.notEqual(newDayId, oldDayId);

  const getRes = await fetch(`${baseUrl}/training-logs/${trainingLog.id}`, { headers: { Cookie: cookie } });
  const fetched = await getRes.json();
  assert.equal(fetched.trainingLog.programDayId, newDayId);
});
