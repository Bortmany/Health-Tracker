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

  const email = `programs-test-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Programs Test' }),
  });
  cookie = registerRes.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('POST /programs creates a program with nested days and exercises', async () => {
  const res = await fetch(`${baseUrl}/programs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      name: 'Push Pull Legs',
      days: [
        { name: 'Push', exercises: [{ name: 'Bench Press', targetSets: 3, targetReps: 8 }] },
        { name: 'Pull', exercises: [{ name: 'Row', targetSets: 3, targetReps: 10 }] },
      ],
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.program.days.length, 2);
  assert.equal(body.program.days[0].exercises[0].name, 'Bench Press');
});

test('PUT /programs/:id replaces days and exercises rather than appending', async () => {
  const createRes = await fetch(`${baseUrl}/programs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Upper Lower', days: [{ name: 'Upper', exercises: [{ name: 'OHP' }] }] }),
  });
  const programId = (await createRes.json()).program.id;

  const putRes = await fetch(`${baseUrl}/programs/${programId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ days: [{ name: 'Lower', exercises: [{ name: 'Squat' }] }] }),
  });
  const body = await putRes.json();

  assert.equal(body.program.days.length, 1);
  assert.equal(body.program.days[0].name, 'Lower');
  assert.equal(body.program.days[0].exercises[0].name, 'Squat');
});

test('a malformed program id returns a clean 404, not a server error', async () => {
  const headers = { 'Content-Type': 'application/json', Cookie: cookie };
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const res = await fetch(`${baseUrl}/programs/not-a-real-id`, {
      method,
      headers,
      ...(method === 'PUT' ? { body: JSON.stringify({ name: 'x' }) } : {}),
    });
    assert.equal(res.status, 404, `${method} on a bad id should be 404`);
  }
});

test('POST /programs rejects a non-list days field with a clean 400', async () => {
  const res = await fetch(`${baseUrl}/programs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Bad Days', days: 'not a list' }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'INVALID_INPUT');
});

test("POST /programs rejects a day whose exercises isn't a list", async () => {
  const res = await fetch(`${baseUrl}/programs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Bad Exercises', days: [{ name: 'Push', exercises: 'nope' }] }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'INVALID_INPUT');
});

test('a second user cannot update another user\'s program', async () => {
  const createRes = await fetch(`${baseUrl}/programs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Private Program', days: [] }),
  });
  const programId = (await createRes.json()).program.id;

  const email = `programs-test-other-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Other' }),
  });
  const otherCookie = registerRes.headers.get('set-cookie').split(';')[0];

  const putRes = await fetch(`${baseUrl}/programs/${programId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: otherCookie },
    body: JSON.stringify({ name: 'Hijacked' }),
  });
  assert.equal(putRes.status, 404);
});
