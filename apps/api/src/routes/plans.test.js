import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

let server;
let baseUrl;
let cookie;
let templateId;

before(async () => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;

  const email = `plans-test-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Plans Test' }),
  });
  cookie = registerRes.headers.get('set-cookie').split(';')[0];

  // The tests create their own template so they don't depend on seed data.
  const name = `Test plan ${Date.now()}`;
  const { rows } = await pool.query(
    `INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
     VALUES ($1, 'A test plan', 'calisthenics', 'beginner', 'none', 3,
             '{"type":"reps","repStep":1,"deloadEveryWeeks":4}'::jsonb,
             '[{"name":"Foundation","weeks":26,"focus":"basics"},{"name":"Build","weeks":26,"focus":"harder versions"}]'::jsonb)
     RETURNING id`,
    [name]
  );
  templateId = rows[0].id;

  const { rows: dayRows } = await pool.query(
    `INSERT INTO plan_template_days (plan_template_id, name, sort_order) VALUES ($1, 'Day 1', 0) RETURNING id`,
    [templateId]
  );
  await pool.query(
    `INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
     VALUES ($1, 'Incline push-up', 3, 10, 0)`,
    [dayRows[0].id]
  );
});

after(async () => {
  await pool.query('DELETE FROM plan_templates WHERE id = $1', [templateId]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('recommended plans match the quiz answers', async () => {
  await fetch(`${baseUrl}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      experienceLevel: 'beginner',
      trainingGoal: 'calisthenics',
      equipment: 'none',
      daysPerWeek: 3,
    }),
  });

  const res = await fetch(`${baseUrl}/plans/templates/recommended`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const { templates } = await res.json();
  assert.ok(templates.length >= 1);
  assert.ok(templates.some((t) => t.id === templateId));
});

test('adopting a plan creates a program and tracks the plan', async () => {
  const res = await fetch(`${baseUrl}/plans/templates/${templateId}/adopt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.durationWeeks, 4);

  const planRes = await fetch(`${baseUrl}/plans/my-plan`, { headers: { Cookie: cookie } });
  const { plan } = await planRes.json();
  assert.equal(plan.weekNumber, 1);
  assert.equal(plan.programId, body.programId);
  assert.ok(plan.guidance.length > 0);

  const programRes = await fetch(`${baseUrl}/programs/${body.programId}`, { headers: { Cookie: cookie } });
  const { program } = await programRes.json();
  assert.equal(program.days.length, 1);
  assert.equal(program.days[0].exercises[0].name, 'Incline push-up');
});

test('a free account cannot start the 52-week plan', async () => {
  const res = await fetch(`${baseUrl}/plans/templates/${templateId}/adopt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ durationWeeks: 52 }),
  });
  assert.equal(res.status, 402);
  const body = await res.json();
  assert.equal(body.error.code, 'PREMIUM_REQUIRED');
});

test('a premium account gets the 52-week plan with phases', async () => {
  const email = `plans-premium-${Date.now()}@example.com`;
  const registerRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'Premium' }),
  });
  const premiumCookie = registerRes.headers.get('set-cookie').split(';')[0];
  await pool.query(`UPDATE users SET plan_tier = 'premium' WHERE email = $1`, [email]);

  const res = await fetch(`${baseUrl}/plans/templates/${templateId}/adopt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: premiumCookie },
    body: JSON.stringify({ durationWeeks: 52 }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.durationWeeks, 52);

  const planRes = await fetch(`${baseUrl}/plans/my-plan`, { headers: { Cookie: premiumCookie } });
  const { plan } = await planRes.json();
  assert.equal(plan.phase.name, 'Foundation');
});
