// The rest of the suite runs with DISABLE_RATE_LIMIT=true. This file turns the
// limits back on to prove the "60 messages an hour" cap works, and that the
// student's and coach's send routes share one budget per person. The flag is
// read per request, so setting it here (before any request) is enough.
process.env.DISABLE_RATE_LIMIT = 'false';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;

before(() => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function register(label) {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `messages-ratelimit-${label}-${Date.now()}@example.com`,
      password: 'hunter2pass',
      displayName: `${label} User`,
    }),
  });
  assert.equal(res.status, 201);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user } = await res.json();
  return { cookie, user };
}

function post(path, who, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: who.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('the 61st message in an hour is refused; reading stays free; each person has their own budget', async () => {
  const coach = await register('coach');
  await pool.query("UPDATE users SET role = 'coach' WHERE id = $1", [coach.user.id]);
  const student = await register('student');
  const inviteRes = await post('/coach/invites', coach);
  const { inviteCode } = await inviteRes.json();
  assert.equal((await post('/coach-link/redeem', student, { code: inviteCode })).status, 200);

  for (let i = 0; i < 60; i += 1) {
    const res = await post('/messages', student, { body: `message ${i + 1}` });
    assert.equal(res.status, 201, `message ${i + 1} should send`);
  }

  const blocked = await post('/messages', student, { body: 'one too many' });
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), {
    error: { message: "You're sending messages very quickly. Please wait a few minutes.", code: 'RATE_LIMITED' },
  });

  // Marking read and checking for unread don't count against the budget.
  assert.equal((await post('/messages/read', student)).status, 200);
  const unreadRes = await fetch(`${baseUrl}/messages/unread`, { headers: { Cookie: student.cookie } });
  assert.equal(unreadRes.status, 200);

  // The coach has their own budget, on the coach's send route.
  const reply = await post(`/coach/clients/${student.user.id}/messages`, coach, { body: 'Slow down!' });
  assert.equal(reply.status, 201);
  assert.equal((await post(`/coach/clients/${student.user.id}/messages/read`, coach)).status, 200);
});

test('both send routes share one per-person budget', async () => {
  // A person who is a coach AND has a coach of their own spends from one budget
  // whichever route they send on.
  const headCoach = await register('head');
  const coach = await register('both');
  await pool.query("UPDATE users SET role = 'coach' WHERE id = ANY($1::uuid[])", [[headCoach.user.id, coach.user.id]]);
  const student = await register('student2');

  const invite1 = await (await post('/coach/invites', coach)).json();
  assert.equal((await post('/coach-link/redeem', student, { code: invite1.inviteCode })).status, 200);
  const invite2 = await (await post('/coach/invites', headCoach)).json();
  assert.equal((await post('/coach-link/redeem', coach, { code: invite2.inviteCode })).status, 200);

  for (let i = 0; i < 30; i += 1) {
    assert.equal((await post(`/coach/clients/${student.user.id}/messages`, coach, { body: `c${i}` })).status, 201);
    assert.equal((await post('/messages', coach, { body: `s${i}` })).status, 201);
  }
  assert.equal((await post('/messages', coach, { body: 'over' })).status, 429);
  assert.equal((await post(`/coach/clients/${student.user.id}/messages`, coach, { body: 'over' })).status, 429);
});
