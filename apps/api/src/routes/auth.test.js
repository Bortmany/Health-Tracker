import assert from 'node:assert/strict';
import { afterAll, beforeAll, test } from 'vitest';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

// Registration is the one place an account's email address is stored, so this
// is where the "an impossible address never gets in" rule is proved.

let server;
let baseUrl;

const stamp = Date.now();

beforeAll(() => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;
});

afterAll(async () => {
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

test('POST /auth/register ignores a client-supplied coach role', async () => {
  const res = await register({
    email: `auth-test-${stamp}-sneaky-coach@example.com`,
    password: 'hunter2pass',
    displayName: 'Sneaky Coach',
    role: 'coach',
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  // A client can never make itself a coach at sign-up.
  assert.equal(body.user.role, 'consumer');
  const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [body.user.id]);
  assert.equal(rows[0].role, 'consumer');
});

test('POST /auth/register does not reveal that an email is already taken', async () => {
  const email = `auth-test-${stamp}-dup@example.com`;
  const first = await register({ email, password: 'hunter2pass', displayName: 'First' });
  assert.equal(first.status, 201);

  const second = await register({ email, password: 'hunter2pass', displayName: 'Second' });
  assert.equal(second.status, 400);
  const body = await second.json();
  // The message must not confirm the address exists (no "already registered").
  assert.ok(!/already|taken|exists|registered/i.test(body.error.message), body.error.message);
});

test('POST /auth/login returns the same generic 401 for an unknown email', async () => {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `auth-test-${stamp}-nobody@example.com`, password: 'whatever123' }),
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, 'INVALID_CREDENTIALS');
});

test('logging out invalidates the token server-side (a captured cookie stops working)', async () => {
  const res = await register({
    email: `auth-test-${stamp}-revoke@example.com`,
    password: 'hunter2pass',
    displayName: 'Revoke Me',
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];

  // The session works before logout.
  const before = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(before.status, 200);

  const logout = await fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(logout.status, 204);

  // The SAME token (as if it had been copied before logout) no longer works.
  const after = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(after.status, 401);
});

test('an oversized request body returns a clean 413, not a 500', async () => {
  // A JSON string field just over the 1 MB limit.
  const huge = 'x'.repeat(1_100_000);
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.com', password: huge }),
  });
  assert.equal(res.status, 413);
  const body = await res.json();
  assert.equal(body.error.code, 'PAYLOAD_TOO_LARGE');
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
