// Plain-English refusals: believable body weight, blank names, blank check-in
// answers, over-long messages, and the "no coach yet" answer for Messages.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;

before(() => {
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

// Returns { cookie, id }. A coach is made by flipping the role in the database.
async function register(role, label) {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${label}-${Date.now()}@example.com`, password: 'hunter2pass', displayName: 'Polish Test' }),
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const id = (await res.json()).user.id;
  if (role === 'coach') await pool.query(`UPDATE users SET role = 'coach' WHERE id = $1`, [id]);
  return { cookie, id };
}
const call = (path, who, method = 'GET', body) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: who.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test('daily-log weight: 0, 999 and 19.9 are refused; blank and spaces save as nothing; 20-400 is fine', async () => {
  const me = await register('consumer', 'weight-range');
  for (const bad of [0, 999, 19.9, 400.1, -5, 'abc']) {
    const res = await call('/logs/2026-05-01', me, 'PUT', { weight: bad });
    assert.equal(res.status, 400, `weight ${bad}`);
  }
  const msg = (await (await call('/logs/2026-05-01', me, 'PUT', { weight: 0 })).json()).error.message;
  assert.equal(msg, 'Weight should be between 20 and 400 kg.');

  for (const blank of ['', '   ', null]) {
    const res = await call('/logs/2026-05-02', me, 'PUT', { weight: blank });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).log.weight, null);
  }
  for (const ok of [20, 82.5, 400]) {
    const res = await call('/logs/2026-05-03', me, 'PUT', { weight: ok });
    assert.equal(res.status, 200, `weight ${ok}`);
    assert.equal(Number((await res.json()).log.weight), ok);
  }
});

test('device sync and settings use the same weight range', async () => {
  const me = await register('consumer', 'weight-sync');
  const sync = await call('/health-sync', me, 'POST', { entries: [{ date: '2026-05-01', weight: 999 }] });
  assert.equal(sync.status, 400);
  const settings = await call('/settings', me, 'PUT', { startWeight: 0, targetWeight: 70 });
  assert.equal(settings.status, 400);
});

test('negative numbers and blank names get plain messages', async () => {
  const me = await register('consumer', 'plain-msg');
  const neg = await call('/logs/2026-05-04', me, 'PUT', { steps: -1 });
  assert.equal(neg.status, 400);
  assert.equal((await neg.json()).error.message, "Steps can't be below 0.");

  const blankName = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `blank-name-${Date.now()}@example.com`, password: 'hunter2pass', displayName: '   ' }),
  });
  assert.equal(blankName.status, 400);
  assert.equal((await blankName.json()).error.message, 'Please enter a name.');
});

test('messages over 2,000 characters are refused, not cut', async () => {
  const student = await register('consumer', 'long-student');
  const res = await call('/messages', student, 'POST', { body: 'x'.repeat(2001) });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.message, 'Messages can be up to 2,000 characters.');
});

test('a coach asking for an unknown client gets a plain 404', async () => {
  const coach = await register('coach', 'unknown-client');
  const unknown = '00000000-0000-4000-8000-000000000000';
  const get = await call(`/coach/clients/${unknown}/messages`, coach);
  assert.equal(get.status, 404);
  assert.equal((await get.json()).error.code, 'NOT_FOUND');
  const read = await call(`/coach/clients/${unknown}/messages/read`, coach, 'POST');
  assert.equal(read.status, 404);
  const bad = await call('/coach/clients/not-an-id/messages', coach);
  assert.equal(bad.status, 404);
});

test('a member who never had a coach hears NO_COACH; one whose link ended hears NOT_FOUND', async () => {
  const student = await register('consumer', 'no-coach');
  for (const [path, method] of [['/messages', 'GET'], ['/messages/read', 'POST']]) {
    const res = await call(path, student, method);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 'NO_COACH');
    assert.equal(body.error.message, "You don't have a coach yet.");
  }
  const send = await call('/messages', student, 'POST', { body: 'hello' });
  assert.equal((await send.json()).error.code, 'NO_COACH');

  const coach = await register('coach', 'ended-coach');
  await pool.query(`INSERT INTO coach_clients (coach_id, client_id, status) VALUES ($1, $2, 'ended')`, [coach.id, student.id]);
  const ended = await call('/messages', student);
  assert.equal(ended.status, 404);
  assert.equal((await ended.json()).error.code, 'NOT_FOUND');
});

test('a check-in answer of only spaces is refused', async () => {
  const student = await register('consumer', 'spaces-answer');
  const res = await call('/checkins/current', student, 'PUT', { mood: 3, answers: ['   '], notes: null, questions: ['q'] });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error.message, /blank space is not an answer/);
});
