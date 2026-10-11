// The AI plan that adjusts every week (paid accounts). A fake writer stands in
// for the AI, so these tests never call Anthropic; the "key" set below only
// flips the feature switch on.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../app.js';
import { pool } from '../db/pool.js';
import { resetAiPlanWriter, setAiPlanWriter } from '../lib/aiPlanGenerator.js';
import { addDays, todayIn } from '../lib/userToday.js';

let server;
let baseUrl;
let libraryTemplateId;
const stamp = Date.now();
let userCount = 0;

// What the fake writer has been asked to do, and how it should behave.
const calls = { generate: 0, adjust: 0 };
let lastAdjustInput = null;
let failGenerate = false;
// How long the fake writer takes, so two requests can overlap.
let generateDelayMs = 0;
let failAdjust = false;
// How long the fake adjust takes, and something to do while it "thinks".
let adjustDelayMs = 0;
let duringAdjust = null;

const ADJUSTMENT = {
  summary: 'Added a set to squats; easier week for legs',
  changes: [
    { day: 'Day 1', exercise: 'Back squat', action: 'change', targetSets: 9, note: 'One more set' },
    { day: 'Day 1', exercise: 'Walking lunge', action: 'add', targetSets: 2, targetReps: 10, note: 'New' },
    { day: 'Day 1', exercise: 'Push-up', action: 'remove', note: 'Rest the shoulder' },
    { day: 'No such day', exercise: 'Back squat', action: 'change', targetSets: 1, note: 'Skipped' },
  ],
};

before(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-only-not-a-real-key';
  setAiPlanWriter({
    async generate() {
      calls.generate += 1;
      if (generateDelayMs) await new Promise((resolve) => setTimeout(resolve, generateDelayMs));
      if (failGenerate) throw new Error('fake writer failure');
      return {
        name: 'AI test plan',
        description: 'Written by the fake writer',
        // Every fake plan uses the same day and exercise names, so the
        // isolation test can prove a change only lands in its owner's program.
        days: [
          {
            name: 'Day 1',
            exercises: [
              { name: 'Back squat', targetSets: 3, targetReps: 5 },
              { name: 'Push-up', targetSets: 3, targetReps: 10 },
            ],
          },
        ],
        progression: { type: 'reps', repStep: 1 },
        phases: [{ name: 'Base', weeks: 52, focus: 'steady work' }],
      };
    },
    async adjust(input) {
      calls.adjust += 1;
      lastAdjustInput = input;
      if (duringAdjust) await duringAdjust();
      if (adjustDelayMs) await new Promise((resolve) => setTimeout(resolve, adjustDelayMs));
      if (failAdjust) throw new Error('fake writer failure');
      return ADJUSTMENT;
    },
  });

  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}/api`;

  const { rows } = await pool.query('SELECT id FROM plan_templates ORDER BY name LIMIT 1');
  libraryTemplateId = rows[0].id;
});

after(async () => {
  resetAiPlanWriter();
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function makeUser({ paid }) {
  userCount += 1;
  const email = `ai-plan-${stamp}-${userCount}@example.com`;
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hunter2pass', displayName: 'AI Plan Test' }),
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { rows } = await pool.query(
    `UPDATE users SET plan_tier = $2 WHERE email = $1 RETURNING id`,
    [email, paid ? 'premium' : 'free']
  );
  return { cookie, id: rows[0].id };
}

function api(user, path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Cookie: user.cookie, ...(options.headers ?? {}) },
  });
}

const writeAiPlan = (user, body = {}) => api(user, '/plans/ai', { method: 'POST', body: JSON.stringify(body) });
const openPlan = async (user) => {
  const res = await api(user, '/plans/my-plan');
  assert.equal(res.status, 200);
  return res.json();
};
const history = async (user) => (await (await api(user, '/plans/ai/history')).json()).adjustments;

// Pretend the plan was written / last adjusted `days` ago — and every AI call
// too, since the server's own day (not the device's) decides every cost rule.
async function backdate(user, days) {
  await pool.query(
    `UPDATE user_plans
     SET last_adjusted_on = last_adjusted_on - $2::integer, start_date = start_date - $2::integer
     WHERE user_id = $1`,
    [user.id, days]
  );
  await backdateAttempts(user, days);
}

async function backdateAttempts(user, days, minutes = 0) {
  await pool.query(
    `UPDATE ai_plan_attempts
     SET attempted_on = attempted_on - $2::integer,
         created_at = created_at - make_interval(days => $2::integer, mins => $3::integer)
     WHERE user_id = $1`,
    [user.id, days, minutes]
  );
}

// The server's UTC day; a device may be up to one day either side of it.
const utcDay = () => new Date().toISOString().slice(0, 10);

async function programDay(user, programId) {
  const res = await api(user, `/programs/${programId}`);
  const { program } = await res.json();
  return program.days[0].exercises;
}

test('a free user is refused with a plain message and the AI is never called', async () => {
  const user = await makeUser({ paid: false });
  const before = calls.generate;

  const res = await writeAiPlan(user);
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.deepEqual(body.error, {
    message: 'The AI plan is part of the paid plan. Upgrade to get a plan that adjusts every week.',
    code: 'PAID_PLAN_REQUIRED',
  });
  assert.equal(calls.generate, before);

  const { plan, aiPlan } = await openPlan(user);
  assert.equal(plan, null);
  assert.deepEqual(aiPlan, { enabled: true, paid: false });
});

test('a free user adopts a library plan in full', async () => {
  const user = await makeUser({ paid: false });
  const res = await api(user, `/plans/templates/${libraryTemplateId}/adopt`, {
    method: 'POST',
    body: JSON.stringify({ durationWeeks: 4 }),
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).durationWeeks, 52);
});

test('a paid user gets an AI plan, re-adjusted once 7 days on, with a notice and history', async () => {
  const user = await makeUser({ paid: true });
  const generateBefore = calls.generate;
  const adjustBefore = calls.adjust;

  const res = await writeAiPlan(user);
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.source, 'ai');
  assert.equal(created.durationWeeks, 52);
  assert.equal(created.startDate, todayIn());
  assert.ok(created.programId && created.firstDayId);
  assert.equal(calls.generate, generateBefore + 1);

  let { plan, aiPlan } = await openPlan(user);
  assert.deepEqual(aiPlan, { enabled: true, paid: true });
  assert.equal(plan.source, 'ai');
  assert.equal(plan.name, 'AI test plan');
  assert.equal(plan.programId, created.programId);
  assert.equal(plan.lastAdjustedOn, created.startDate);
  assert.equal(plan.adjustedThisWeek, false);
  assert.equal(plan.latestAdjustment, null);
  assert.equal(plan.phase.name, 'Base');

  // Within the week: a second write and a second open never reach the AI.
  const again = await writeAiPlan(user);
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error.code, 'AI_PLAN_RECENT');
  await openPlan(user);
  assert.equal(calls.generate, generateBefore + 1);
  assert.equal(calls.adjust, adjustBefore);

  // Some logs from the last week, which should be handed to the AI.
  const yesterday = addDays(todayIn(), -1);
  await pool.query(
    `INSERT INTO daily_logs (user_id, date, weight, sleep, steps, calories) VALUES ($1, $2, 80.5, 7, 9000, 2500)`,
    [user.id, yesterday]
  );

  await backdate(user, 7);
  ({ plan } = await openPlan(user));
  assert.equal(calls.adjust, adjustBefore + 1);
  assert.equal(plan.adjustedThisWeek, true);
  assert.equal(plan.latestAdjustment.summary, ADJUSTMENT.summary);
  assert.equal(plan.latestAdjustment.weekNumber, 2);
  assert.equal(plan.lastAdjustedOn, todayIn());
  // Only the changes that matched the plan were saved.
  assert.equal(plan.latestAdjustment.changes.length, 3);

  // What the AI was sent: the plan, this week's logs, no food data.
  assert.equal(lastAdjustInput.weekNumber, 2);
  assert.equal(lastAdjustInput.currentPlan[0].name, 'Day 1');
  assert.deepEqual(lastAdjustInput.weighIns, [{ date: yesterday, weight: 80.5 }]);
  assert.equal(lastAdjustInput.recovery.days[0].sleepHours, 7);
  assert.equal(JSON.stringify(lastAdjustInput).includes('2500'), false);
  assert.equal(/calorie|protein|meal/i.test(JSON.stringify(lastAdjustInput)), false);

  // The changes landed in the user's own program.
  const exercises = await programDay(user, created.programId);
  assert.equal(exercises.find((e) => e.name === 'Back squat').targetSets, 9);
  assert.ok(exercises.some((e) => e.name === 'Walking lunge'));
  assert.equal(exercises.some((e) => e.name === 'Push-up'), false);

  const rows = await history(user);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].summary, ADJUSTMENT.summary);

  // Opening again the same day doesn't adjust twice.
  await openPlan(user);
  assert.equal(calls.adjust, adjustBefore + 1);
});

test('if the AI fails at the weekly moment the plan is unchanged and it is not retried the same day', async () => {
  const user = await makeUser({ paid: true });
  const created = await (await writeAiPlan(user)).json();
  await backdate(user, 8);
  const backdatedTo = addDays(created.startDate, -8);
  const adjustBefore = calls.adjust;

  failAdjust = true;
  try {
    const { plan } = await openPlan(user);
    assert.equal(calls.adjust, adjustBefore + 1);
    assert.equal(plan.adjustedThisWeek, false);
    assert.equal(plan.latestAdjustment, null);
    assert.equal(plan.lastAdjustedOn, backdatedTo);

    // A second open the same day does not try again.
    const second = await openPlan(user);
    assert.equal(calls.adjust, adjustBefore + 1);
    assert.equal(second.plan.lastAdjustedOn, backdatedTo);
  } finally {
    failAdjust = false;
  }

  const exercises = await programDay(user, created.programId);
  assert.equal(exercises.find((e) => e.name === 'Back squat').targetSets, 3);
  assert.ok(exercises.some((e) => e.name === 'Push-up'));
  assert.deepEqual(await history(user), []);
});

test('with no API key the AI plan says it is not switched on and the library plan still works', async () => {
  const user = await makeUser({ paid: true });
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const generateBefore = calls.generate;
  try {
    const res = await writeAiPlan(user);
    assert.equal(res.status, 503);
    assert.deepEqual((await res.json()).error, {
      message: "The AI plan isn't switched on yet. Your plan from the library still works.",
      code: 'AI_NOT_ENABLED',
    });
    assert.equal(calls.generate, generateBefore);

    const adopt = await api(user, `/plans/templates/${libraryTemplateId}/adopt`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(adopt.status, 201);
    const { plan, aiPlan } = await openPlan(user);
    assert.equal(plan.source, 'library');
    assert.equal(plan.durationWeeks, 52);
    assert.deepEqual(aiPlan, { enabled: false, paid: true });

    const status = await (await api(user, '/billing/status')).json();
    assert.equal(status.aiPlanEnabled, false);
  } finally {
    process.env.ANTHROPIC_API_KEY = saved;
  }
});

test("one user can never see or trigger another user's adjustments", async () => {
  const userA = await makeUser({ paid: true });
  const userB = await makeUser({ paid: true });
  const planA = await (await writeAiPlan(userA)).json();
  const planB = await (await writeAiPlan(userB)).json();

  // A's week is up; B's plan is brand new. Both programs have a "Day 1" with
  // "Back squat", so a change matched by name alone would leak across.
  await backdate(userA, 7);
  const adjustBefore = calls.adjust;

  // B opening their plan never triggers anything for A.
  const b = await openPlan(userB);
  assert.equal(calls.adjust, adjustBefore);
  assert.equal(b.plan.latestAdjustment, null);

  // A opens theirs: A's program changes, B's does not.
  const a = await openPlan(userA);
  assert.equal(calls.adjust, adjustBefore + 1);
  assert.equal(a.plan.adjustedThisWeek, true);
  assert.equal((await programDay(userA, planA.programId)).find((e) => e.name === 'Back squat').targetSets, 9);
  const bExercises = await programDay(userB, planB.programId);
  assert.equal(bExercises.find((e) => e.name === 'Back squat').targetSets, 3);
  assert.ok(bExercises.some((e) => e.name === 'Push-up'));

  // B's history and notice stay empty; A's history has the row.
  assert.deepEqual(await history(userB), []);
  const bAgain = await openPlan(userB);
  assert.equal(bAgain.plan.latestAdjustment, null);
  assert.equal(bAgain.plan.adjustedThisWeek, false);
  assert.equal((await history(userA)).length, 1);

  // B can't read A's program either.
  const peek = await api(userB, `/programs/${planA.programId}`);
  assert.equal(peek.status, 404);
});

test('a failed write is a plain 502, and a fourth try in one day hits the daily cap', async () => {
  const user = await makeUser({ paid: true });
  const generateBefore = calls.generate;
  failGenerate = true;
  try {
    for (let i = 0; i < 3; i += 1) {
      const res = await writeAiPlan(user);
      assert.equal(res.status, 502);
      assert.deepEqual((await res.json()).error, {
        message: "We couldn't write your AI plan just now. Your current plan is unchanged — please try again later.",
        code: 'AI_FAILED',
      });
      if (i === 0) {
        // Straight after a failed try, a retry waits a few minutes.
        const tooSoon = await writeAiPlan(user);
        assert.equal(tooSoon.status, 409);
        assert.equal((await tooSoon.json()).error.code, 'AI_PLAN_RECENT');
        assert.equal(calls.generate, generateBefore + 1);
      }
      // Move the tries back past that short window (same server day).
      await backdateAttempts(user, 0, 6);
    }
    assert.equal(calls.generate, generateBefore + 3);

    const res = await writeAiPlan(user);
    assert.equal(res.status, 429);
    assert.deepEqual((await res.json()).error, {
      message: "You've reached today's limit for AI plan requests. Please try again tomorrow.",
      code: 'AI_DAILY_LIMIT',
    });
    assert.equal(calls.generate, generateBefore + 3);
  } finally {
    failGenerate = false;
  }

  // Nothing was saved along the way.
  const { plan } = await openPlan(user);
  assert.equal(plan, null);
});

test('someone who cancelled keeps their last AI plan, but it stops adjusting', async () => {
  const user = await makeUser({ paid: true });
  const created = await (await writeAiPlan(user)).json();
  await pool.query(`UPDATE users SET plan_tier = 'free' WHERE id = $1`, [user.id]);
  await backdate(user, 14);
  const adjustBefore = calls.adjust;

  const { plan, aiPlan } = await openPlan(user);
  assert.equal(aiPlan.paid, false);
  assert.equal(plan.source, 'ai');
  assert.equal(plan.programId, created.programId);
  assert.equal(calls.adjust, adjustBefore);

  const res = await writeAiPlan(user);
  assert.equal(res.status, 403);
});

test('history needs a signed-in user', async () => {
  const res = await fetch(`${baseUrl}/plans/ai/history`);
  assert.equal(res.status, 401);
});

test('a start date far from today is a plain 400 and never reaches the AI', async () => {
  const user = await makeUser({ paid: true });
  const before = calls.generate;
  for (const startDate of ['2000-01-01', addDays(utcDay(), -8), addDays(utcDay(), 3)]) {
    const res = await writeAiPlan(user, { startDate });
    assert.equal(res.status, 400);
    assert.deepEqual((await res.json()).error, {
      message: "startDate must be today's date on your device",
      code: 'INVALID_INPUT',
    });
  }
  assert.equal(calls.generate, before);
});

test('a start date in the past does not get around the 7-day rule', async () => {
  const user = await makeUser({ paid: true });
  const generateBefore = calls.generate;
  const adjustBefore = calls.adjust;
  // The earliest day a device may send.
  const startDate = addDays(utcDay(), -1);

  const res = await writeAiPlan(user, { startDate });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).startDate, startDate);

  // The week is counted from the server's own day, not the start date.
  const { plan } = await openPlan(user);
  assert.equal(plan.lastAdjustedOn, todayIn());
  assert.equal(calls.adjust, adjustBefore);

  const again = await writeAiPlan(user, { startDate });
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error.code, 'AI_PLAN_RECENT');
  assert.equal(calls.generate, generateBefore + 1);
});

test('switching to a library plan and back does not get around the 7-day rule', async () => {
  const user = await makeUser({ paid: true });
  const generateBefore = calls.generate;
  assert.equal((await writeAiPlan(user)).status, 201);

  const adopt = await api(user, `/plans/templates/${libraryTemplateId}/adopt`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert.equal(adopt.status, 201);
  assert.equal((await openPlan(user)).plan.source, 'library');

  const again = await writeAiPlan(user);
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error.code, 'AI_PLAN_RECENT');
  assert.equal(calls.generate, generateBefore + 1);

  // A week later (by the server's day) a new AI plan is allowed again.
  await backdateAttempts(user, 7);
  assert.equal((await writeAiPlan(user)).status, 201);
  assert.equal(calls.generate, generateBefore + 2);
});

test('two requests at once reach the AI only once', async () => {
  const user = await makeUser({ paid: true });
  const generateBefore = calls.generate;
  generateDelayMs = 200;
  try {
    const responses = await Promise.all([writeAiPlan(user), writeAiPlan(user)]);
    const statuses = responses.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409]);
    const refused = responses.find((r) => r.status === 409);
    assert.equal((await refused.json()).error.code, 'AI_PLAN_RECENT');
    assert.equal(calls.generate, generateBefore + 1);
  } finally {
    generateDelayMs = 0;
  }
  const { plan } = await openPlan(user);
  assert.equal(plan.source, 'ai');
});

test('a new AI plan is refused while the weekly adjustment is still running', async () => {
  const user = await makeUser({ paid: true });
  assert.equal((await writeAiPlan(user)).status, 201);
  await backdate(user, 14);
  const generateBefore = calls.generate;
  const adjustBefore = calls.adjust;

  let refused;
  duringAdjust = async () => {
    duringAdjust = null;
    refused = await writeAiPlan(user);
  };
  adjustDelayMs = 100;
  try {
    const { plan } = await openPlan(user);
    assert.equal(plan.adjustedThisWeek, true);
  } finally {
    duringAdjust = null;
    adjustDelayMs = 0;
  }
  assert.equal(refused.status, 409);
  assert.deepEqual((await refused.json()).error, {
    message: 'Your last AI plan request was only a moment ago. Please wait a few minutes and try again.',
    code: 'AI_PLAN_RECENT',
  });
  // The writer was called only for the adjustment.
  assert.equal(calls.generate, generateBefore);
  assert.equal(calls.adjust, adjustBefore + 1);
});

// If a new plan still lands while an old adjustment is in flight (here: the AI
// is so slow the "running" window has passed), the old adjustment must not
// touch the new plan — whether it succeeds or fails.
for (const fails of [false, true]) {
  test(`a plan replaced mid-adjustment keeps its own date and no notice (adjustment ${fails ? 'fails' : 'succeeds'})`, async () => {
    const user = await makeUser({ paid: true });
    const old = await (await writeAiPlan(user)).json();
    await backdate(user, 14);

    let replaced;
    duringAdjust = async () => {
      duringAdjust = null;
      await backdateAttempts(user, 0, 6);
      replaced = await writeAiPlan(user);
    };
    failAdjust = fails;
    try {
      const { plan } = await openPlan(user);
      assert.equal(replaced.status, 201);
      const created = await replaced.json();
      assert.notEqual(created.programId, old.programId);
      // The new plan is shown, untouched by the old adjustment.
      assert.equal(plan.programId, created.programId);
      assert.equal(plan.lastAdjustedOn, todayIn());
      assert.equal(plan.adjustedThisWeek, false);
      assert.equal(plan.latestAdjustment, null);
    } finally {
      duringAdjust = null;
      failAdjust = false;
    }

    const { rows } = await pool.query(
      'SELECT last_adjusted_on::text AS d FROM user_plans WHERE user_id = $1',
      [user.id]
    );
    assert.equal(rows[0].d, todayIn());
    assert.deepEqual(await history(user), []);
    // Neither program had the old adjustment applied.
    for (const programId of [old.programId, (await openPlan(user)).plan.programId]) {
      const squat = (await programDay(user, programId)).find((e) => e.name === 'Back squat');
      assert.equal(squat.targetSets, 3);
    }
    // The finished (or failed) adjustment is still counted against the day.
    const { rows: attempts } = await pool.query(
      `SELECT COUNT(*)::integer AS n FROM ai_plan_attempts WHERE user_id = $1 AND kind = 'adjust'`,
      [user.id]
    );
    assert.equal(attempts[0].n, 1);
  });
}
