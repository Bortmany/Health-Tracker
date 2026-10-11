// Page reloads (/auth/me), logout and invite-code redeem must NOT use up the
// strict password-guessing budget, while login and wrong invite codes stay capped.
process.env.DISABLE_RATE_LIMIT = 'false';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;
let cookie;

before(async () => {
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}/api`;
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `session-rl-${Date.now()}@example.com`, password: 'hunter2pass', displayName: 'Session RL' }),
  });
  cookie = res.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('/auth/me can be called 70 times in a row and never gets a 429', async () => {
  for (let i = 0; i < 70; i += 1) {
    const res = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200, `call ${i + 1}`);
  }
});

test('invite codes: valid ones work before the limit; after 20 wrong guesses even a valid code gets 429', async () => {
  const redeem = (c, code) => fetch(`${baseUrl}/coach-link/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: c },
    body: JSON.stringify({ code }),
  });
  const mkUser = async (label) => {
    const r = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${label}-${Date.now()}@example.com`, password: 'hunter2pass', displayName: label }),
    });
    const body = await r.json();
    return { cookie: r.headers.get('set-cookie').split(';')[0], id: body.user.id };
  };
  const coach = await mkUser('rl-coach');
  const student = await mkUser('rl-student');
  const student2 = await mkUser('rl-student2');
  await pool.query("UPDATE users SET role = 'coach' WHERE id = $1", [coach.id]);
  const makeInvite = async () => {
    const r = await fetch(`${baseUrl}/coach/invites`, { method: 'POST', headers: { Cookie: coach.cookie } });
    assert.equal(r.status, 201);
    return (await r.json()).inviteCode;
  };
  const valid1 = await makeInvite();
  const valid2 = await makeInvite();

  // Before the limit: one wrong guess is a clean 404, and a right code works.
  assert.equal((await redeem(student.cookie, 'nope-first')).status, 404);
  assert.equal((await redeem(student.cookie, valid1)).status, 200);

  // Use up the rest of the 20 wrong guesses (one already counted).
  for (let i = 0; i < 19; i += 1) {
    assert.equal((await redeem(student2.cookie, `nope-${i}`)).status, 404, `wrong guess ${i + 2}`);
  }
  // Locked out: a valid code gets the same 429 as a wrong one.
  assert.equal((await redeem(student2.cookie, valid2)).status, 429);
  assert.equal((await redeem(student2.cookie, 'nope-again')).status, 429);
  const me = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
});

test('login is still capped per IP after 20 wrong passwords', async () => {
  let blocked = false;
  for (let i = 0; i < 25; i += 1) {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `nobody-${Date.now()}-${i}@example.com`, password: 'wrong-password-guess' }),
    });
    if (res.status === 429) blocked = true;
    else assert.equal(res.status, 401);
  }
  assert.equal(blocked, true);
});

test('logout is not caught by the strict 20-per-15-minutes limit', async () => {
  for (let i = 0; i < 30; i += 1) {
    const res = await fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.notEqual(res.status, 429, `logout ${i + 1}`);
  }
});
