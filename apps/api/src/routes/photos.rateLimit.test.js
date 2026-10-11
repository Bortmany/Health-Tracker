// The rest of the suite runs with DISABLE_RATE_LIMIT=true. This file turns the
// limits back on to prove the "20 photo uploads a day" cap works, per person,
// and that looking at, sharing and deleting photos don't count. The flag is
// read per request, so setting it here (before any request) is enough.
process.env.DISABLE_RATE_LIMIT = 'false';

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cut-photos-ratelimit-'));
process.env.UPLOAD_DIR = uploadDir;

const { app } = await import('../app.js');
const { pool } = await import('../db/pool.js');
const { makeJpeg } = await import('../lib/testImages.js');

let server;
let baseUrl;
const today = new Date().toISOString().slice(0, 10);

before(() => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

async function register(label) {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `photos-ratelimit-${label}-${Date.now()}@example.com`,
      password: 'hunter2pass',
      displayName: `${label} User`,
    }),
  });
  assert.equal(res.status, 201);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user } = await res.json();
  return { cookie, user };
}

function upload(who) {
  return fetch(`${baseUrl}/photos?today=${today}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', Cookie: who.cookie },
    body: makeJpeg(),
  });
}

test('the 21st upload in a day is refused; other photo actions stay free; each person has their own budget', async () => {
  const student = await register('student');
  let lastId;
  for (let i = 0; i < 20; i += 1) {
    const res = await upload(student);
    assert.equal(res.status, 201, `upload ${i + 1} should work`);
    lastId = (await res.json()).photo.id;
  }

  const blocked = await upload(student);
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), {
    error: { message: "You've added a lot of photos today. Please try again tomorrow.", code: 'RATE_LIMITED' },
  });

  const headers = { Cookie: student.cookie };
  assert.equal((await fetch(`${baseUrl}/photos`, { headers })).status, 200);
  assert.equal((await fetch(`${baseUrl}/photos/${lastId}/file`, { headers })).status, 200);
  const share = await fetch(`${baseUrl}/photos/${lastId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sharedWithCoach: true }),
  });
  assert.equal(share.status, 200);
  assert.equal((await fetch(`${baseUrl}/photos/${lastId}`, { method: 'DELETE', headers })).status, 204);
  // Deleting doesn't give an upload back today.
  assert.equal((await upload(student)).status, 429);

  // Someone else still has their full budget.
  const other = await register('other');
  assert.equal((await upload(other)).status, 201);
});
