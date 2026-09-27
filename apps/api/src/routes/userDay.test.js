// The login streak, the plan's week number and the coach's client signals all
// count days from the user's own day (?today= from the device, else Oman's
// day), never from the server's UTC day.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';
import { addDays } from '../lib/userToday.js';

let server;
let baseUrl;
let cookie;
let templateId;

// The UTC day right now. Any device on Earth is within one day of it, so the
// server accepts it (and the day either side) as ?today=.
const UTC_TODAY = new Date().toISOString().slice(0, 10);

async function call(path, { method = 'GET', body, as = cookie } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: as },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

async function register(tag) {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${tag}-${Date.now()}@example.com`, password: 'hunter2pass', displayName: tag }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

before(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;
  cookie = await register('user-day');

  const { rows } = await pool.query(
    `INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
     VALUES ($1, 'A test plan', 'calisthenics', 'beginner', 'none', 3,
             '{"type":"reps","repStep":1}'::jsonb, '[{"name":"Base","weeks":52,"focus":"basics"}]'::jsonb)
     RETURNING id`,
    [`User day plan ${Date.now()}`]
  );
  templateId = rows[0].id;
  const { rows: dayRows } = await pool.query(
    `INSERT INTO plan_template_days (plan_template_id, name, sort_order) VALUES ($1, 'Day 1', 0) RETURNING id`,
    [templateId]
  );
  await pool.query(
    `INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
     VALUES ($1, 'Push-up', 3, 10, 0)`,
    [dayRows[0].id]
  );
});

after(async () => {
  await pool.query('DELETE FROM plan_templates WHERE id = $1', [templateId]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('the streak counts back from the day the device sends', async () => {
  // Logged the day before and the day of the UTC date.
  for (const date of [addDays(UTC_TODAY, -1), UTC_TODAY]) {
    const res = await call(`/logs/${date}`, { method: 'PUT', body: { steps: 5000 } });
    assert.equal(res.status, 200);
  }

  // Late evening: the device's day is the UTC day, both logs count.
  assert.equal((await call(`/logs/streak?today=${UTC_TODAY}`)).body.streak, 2);

  // Just after midnight on a device ahead of UTC (Oman at 1 am): it's already
  // the next day there, nothing logged yet, so yesterday's streak still stands.
  assert.equal((await call(`/logs/streak?today=${addDays(UTC_TODAY, 1)}`)).body.streak, 2);

  // A log made just after that midnight joins the streak.
  await call(`/logs/${addDays(UTC_TODAY, 1)}`, { method: 'PUT', body: { steps: 300 } });
  assert.equal((await call(`/logs/streak?today=${addDays(UTC_TODAY, 1)}`)).body.streak, 3);

  // With no day sent, the server still answers with a number (Oman's day).
  assert.equal(typeof (await call('/logs/streak')).body.streak, 'number');
});

test('a made-up or far-off today is refused with a plain 400', async () => {
  for (const path of [
    '/logs/streak?today=nonsense',
    `/logs/streak?today=${addDays(UTC_TODAY, 5)}`,
    '/plans/my-plan?today=2026-13-45',
    '/export?today=yesterday',
  ]) {
    const res = await call(path);
    assert.equal(res.status, 400, path);
    assert.match(res.body.error.message, /today|YYYY-MM-DD/, path);
  }
});

test('the plan\'s week turns over at the user\'s midnight', async () => {
  // Started exactly one week before the device's day.
  const startDate = addDays(UTC_TODAY, -6);
  const adopt = await call(`/plans/templates/${templateId}/adopt`, { method: 'POST', body: { startDate } });
  assert.equal(adopt.status, 201);

  // Late evening on day 7: still week 1.
  assert.equal((await call(`/plans/my-plan?today=${UTC_TODAY}`)).body.plan.weekNumber, 1);
  // Just after midnight, a device ahead of UTC is on day 8: week 2 already.
  assert.equal((await call(`/plans/my-plan?today=${addDays(UTC_TODAY, 1)}`)).body.plan.weekNumber, 2);
});

test('the data export counts the streak from the device\'s day too', async () => {
  const res = await call(`/export?today=${addDays(UTC_TODAY, 1)}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.streak, 3);
});
