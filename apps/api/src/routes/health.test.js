// /api/health shows every dormant switch in plain words and never a secret.
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

test('health names the AI, photo, money and email switches without any key', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-secret-value';
  try {
    const text = await (await fetch(`${baseUrl}/health`)).text();
    const body = JSON.parse(text);
    assert.equal(body.ai, 'configured');
    for (const key of ['sentry', 'photos', 'billing', 'payouts', 'email']) {
      assert.ok(body[key] !== undefined, `health shows ${key}`);
    }
    assert.doesNotMatch(text, /sk-ant-test-secret-value/);
    delete process.env.ANTHROPIC_API_KEY;
    const off = await (await fetch(`${baseUrl}/health`)).json();
    assert.equal(off.ai, 'dormant');
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved;
  }
});
