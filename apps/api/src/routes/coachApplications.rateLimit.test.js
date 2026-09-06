// The rest of the suite runs with DISABLE_RATE_LIMIT=true. This file turns the
// limits back on to prove the "3 coach applications per day" cap works. The
// flag is read per request, so setting it here (before any request) is enough.
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

test('the fourth coach application in a day is refused with a clear message', async () => {
  const email = `coach-app-ratelimit-${Date.now()}@example.com`;
  const reg = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Rate Limit User' }),
  });
  assert.equal(reg.status, 201);
  const cookie = reg.headers.get('set-cookie').split(';')[0];

  const form = {
    displayName: 'Coach', credentials: 'Cert', yearsCoaching: 1, approach: 'Approach', agreedToTerms: true,
  };
  const submit = () => fetch(`${baseUrl}/coach-applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(form),
  });

  // Submit and withdraw three times — each is a real, allowed application.
  for (let i = 0; i < 3; i += 1) {
    const res = await submit();
    assert.equal(res.status, 201, `application ${i + 1} should be accepted`);
    const { application } = await res.json();
    const del = await fetch(`${baseUrl}/coach-applications/${application.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    assert.equal(del.status, 204);
  }

  const blocked = await submit();
  assert.equal(blocked.status, 429);
  const body = await blocked.json();
  assert.equal(body.error.code, 'RATE_LIMITED');
  assert.ok(
    blocked.headers.get('retry-after') || blocked.headers.get('ratelimit-limit') || blocked.headers.get('ratelimit'),
    'a Retry-After or RateLimit header tells the app when to try again'
  );

  // Reading your own status is never throttled.
  const mine = await fetch(`${baseUrl}/coach-applications/mine`, { headers: { Cookie: cookie } });
  assert.equal(mine.status, 200);
});
