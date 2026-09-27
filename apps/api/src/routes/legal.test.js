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

test('GET /legal/contact is public and falls back to the owner address', async () => {
  const previous = process.env.PRIVACY_CONTACT_EMAIL;
  delete process.env.PRIVACY_CONTACT_EMAIL;
  try {
    const res = await fetch(`${baseUrl}/legal/contact`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { contact: { email: 'naeljam@hotmail.com' } });
  } finally {
    if (previous !== undefined) process.env.PRIVACY_CONTACT_EMAIL = previous;
  }
});

test('GET /legal/contact uses PRIVACY_CONTACT_EMAIL when set', async () => {
  const previous = process.env.PRIVACY_CONTACT_EMAIL;
  process.env.PRIVACY_CONTACT_EMAIL = '  support@example.com ';
  try {
    const res = await fetch(`${baseUrl}/legal/contact`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.contact.email, 'support@example.com');
  } finally {
    if (previous === undefined) delete process.env.PRIVACY_CONTACT_EMAIL;
    else process.env.PRIVACY_CONTACT_EMAIL = previous;
  }
});

test('GET /legal/contact ignores a blank PRIVACY_CONTACT_EMAIL', async () => {
  const previous = process.env.PRIVACY_CONTACT_EMAIL;
  process.env.PRIVACY_CONTACT_EMAIL = '   ';
  try {
    const res = await fetch(`${baseUrl}/legal/contact`);
    const body = await res.json();
    assert.equal(body.contact.email, 'naeljam@hotmail.com');
  } finally {
    if (previous === undefined) delete process.env.PRIVACY_CONTACT_EMAIL;
    else process.env.PRIVACY_CONTACT_EMAIL = previous;
  }
});
