import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

// Registration is the one place an account's email address is stored, so this
// is where the "an impossible address never gets in" rule is proved.

let server;
let baseUrl;

const stamp = Date.now();

before(() => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;
});

after(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`auth-test-${stamp}%`]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

function register(body) {
  return fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('POST /auth/register accepts a normal address and creates the account', async () => {
  const res = await register({
    email: `auth-test-${stamp}@example.com`,
    password: 'hunter2pass',
    displayName: 'Auth Test',
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.user.email, `auth-test-${stamp}@example.com`);
});

test('POST /auth/register rejects an email that cannot exist', async () => {
  const res = await register({
    email: 'JohnDoe@gmail',
    password: 'hunter2pass',
    displayName: 'No At Sign',
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'INVALID_INPUT');
  assert.match(body.error.message, /valid email address/);

  // Nothing was written.
  const { rowCount } = await pool.query('SELECT 1 FROM users WHERE display_name = $1', ['No At Sign']);
  assert.equal(rowCount, 0);
});

test('POST /auth/register rejects a broken domain', async () => {
  for (const email of ['johndoe@gmail..com', 'johndoe@.com', '@gmail.com', 'john doe@gmail.com']) {
    const res = await register({ email, password: 'hunter2pass', displayName: 'Broken Domain' });
    assert.equal(res.status, 400, `expected ${email} to be rejected`);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_INPUT');
  }
});

test('POST /auth/register trims and lower-cases the stored address', async () => {
  const res = await register({
    email: `  AUTH-TEST-${stamp}-Mixed@Example.COM `,
    password: 'hunter2pass',
    displayName: 'Mixed Case',
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.user.email, `auth-test-${stamp}-mixed@example.com`);
});
