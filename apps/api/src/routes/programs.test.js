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
