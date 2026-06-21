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

  const email = `nutrition-test-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Nutrition Test' }),
  });
  cookie = registerRes.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('PUT /nutrition/:date creates a log with nested meals', async () => {
  const res = await fetch(`${baseUrl}/nutrition/2026-03-01`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      calories: 2200,
      protein: 160,
      meals: [{ name: 'Oats', calories: 400, protein: 20 }, { name: 'Chicken bowl', calories: 600, protein: 50 }],
    }),
  });
  assert.equal(res.status, 200);

  const getRes = await fetch(`${baseUrl}/nutrition/2026-03-01`, { headers: { Cookie: cookie } });
  const body = await getRes.json();

  assert.equal(body.log.calories, 2200);
  assert.equal(body.meals.length, 2);
  assert.equal(body.meals[0].name, 'Oats');
});

test('PUT /nutrition/:date on an existing date replaces meals rather than appending', async () => {
  await fetch(`${baseUrl}/nutrition/2026-03-02`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ meals: [{ name: 'Eggs', calories: 300 }] }),
  });
  await fetch(`${baseUrl}/nutrition/2026-03-02`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ meals: [{ name: 'Yogurt', calories: 150 }] }),
  });

  const getRes = await fetch(`${baseUrl}/nutrition/2026-03-02`, { headers: { Cookie: cookie } });
  const body = await getRes.json();

  assert.equal(body.meals.length, 1);
  assert.equal(body.meals[0].name, 'Yogurt');
});

test('a second user cannot read another user\'s nutrition log for the same date', async () => {
  const email = `nutrition-test-other-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Other' }),
  });
  const otherCookie = registerRes.headers.get('set-cookie').split(';')[0];

  const getRes = await fetch(`${baseUrl}/nutrition/2026-03-01`, { headers: { Cookie: otherCookie } });
  const body = await getRes.json();

  assert.equal(body.log, null);
});
