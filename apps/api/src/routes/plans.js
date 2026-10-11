import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  aiPlanWriter,
  cleanAiAdjustment,
  cleanAiPlan,
  isAiPlanGenerationEnabled,
} from '../lib/aiPlanGenerator.js';
import { logger } from '../lib/logger.js';
import { rankTemplates, weekTargets } from '../lib/planGenerator.js';
import { PLAN_WEEKS } from '../lib/planLength.js';
import * as validate from '../lib/validate.js';
import { withTransaction } from '../lib/withTransaction.js';
import { DEFAULT_TIME_ZONE, addDays, daysBetween, nearToday, resolveToday, todayIn } from '../lib/userToday.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// A malformed :id would otherwise reach Postgres as an invalid UUID and throw a
// 500 — this turns it into a clean "not found".
function planNotFound(res) {
  return res.status(404).json({ error: { message: 'Plan not found', code: 'NOT_FOUND' } });
}

function toPublicTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    goal: row.goal,
    experience: row.experience,
    equipment: row.equipment,
    daysPerWeek: row.days_per_week,
  };
}

async function fetchTemplateDays(templateId) {
  const { rows: dayRows } = await pool.query(
    'SELECT * FROM plan_template_days WHERE plan_template_id = $1 ORDER BY sort_order',
    [templateId]
  );
  const { rows: exerciseRows } = await pool.query(
    `SELECT e.* FROM plan_template_exercises e
     JOIN plan_template_days d ON d.id = e.plan_template_day_id
     WHERE d.plan_template_id = $1
     ORDER BY e.sort_order`,
    [templateId]
  );
  return dayRows.map((day) => ({
    id: day.id,
    name: day.name,
    exercises: exerciseRows
      .filter((e) => e.plan_template_day_id === day.id)
      .map((e) => ({ name: e.name, targetSets: e.target_sets, targetReps: e.target_reps })),
  }));
}

async function fetchQuizAnswers(userId) {
  const { rows } = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
  const s = rows[0] ?? {};
  return {
    age: s.age,
    experienceLevel: s.experience_level,
    trainingGoal: s.training_goal,
    equipment: s.equipment,
    daysPerWeek: s.days_per_week,
  };
}

router.use(requireAuth);

router.get('/templates', asyncHandler(async (req, res) => {
  const filters = [];
  const params = [];
  for (const key of ['goal', 'experience', 'equipment']) {
    // Only accept a plain string. A repeated param (?goal=a&goal=b) arrives as an
    // array, which would bind as text[] and break the `key = $n` text comparison
    // (a 500) — ignore anything that isn't a single string value.
    if (typeof req.query[key] === 'string' && req.query[key]) {
      params.push(req.query[key]);
      filters.push(`${key} = $${params.length}`);
    }
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM plan_templates ${where} ORDER BY name`, params);
  res.json({ templates: rows.map(toPublicTemplate) });
}));

router.get('/templates/recommended', asyncHandler(async (req, res) => {
  const answers = await fetchQuizAnswers(req.userId);
  const { rows } = await pool.query('SELECT * FROM plan_templates');
  const ranked = rankTemplates(rows, answers).slice(0, 3);
  res.json({ templates: ranked.map((r) => toPublicTemplate(r.template)) });
}));


// --- The current plan -----------------------------------------------------

// At most this many AI calls (writing + weekly adjusting together) per user
// per day. The day comes from the server's own clock, never the device's.
const DAILY_AI_CAP = 3;

// A new AI plan can be written at most once every this many server days.
const AI_WRITE_EVERY_DAYS = 7;

// A plan-write or weekly adjustment that started less than this long ago and
// hasn't finished is treated as still running, so a second request can't reach
// the AI at the same time. Longer than the slowest possible AI call (AI_CALL_TIMEOUT_MS,
// retry included); a failed try stops blocking once the window passes.
const WRITE_IN_PROGRESS_WINDOW = '5 minutes';

const AI_ERRORS = {
  paid: {
    status: 403,
    message: 'The AI plan is part of the paid plan. Upgrade to get a plan that adjusts every week.',
    code: 'PAID_PLAN_REQUIRED',
  },
  disabled: {
    status: 503,
    message: "The AI plan isn't switched on yet. Your plan from the library still works.",
    code: 'AI_NOT_ENABLED',
  },
  recent: {
    status: 409,
    message: 'Your AI plan was written less than a week ago. It will adjust itself next week.',
    code: 'AI_PLAN_RECENT',
  },
  running: {
    status: 409,
    message: 'Your last AI plan request was only a moment ago. Please wait a few minutes and try again.',
    code: 'AI_PLAN_RECENT',
  },
  limit: {
    status: 429,
    message: "You've reached today's limit for AI plan requests. Please try again tomorrow.",
    code: 'AI_DAILY_LIMIT',
  },
  failed: {
    status: 502,
    message: "We couldn't write your AI plan just now. Your current plan is unchanged — please try again later.",
    code: 'AI_FAILED',
  },
};

function sendAiError(res, key) {
  const { status, message, code } = AI_ERRORS[key];
  return res.status(status).json({ error: { message, code } });
}

// The signed-in user's plan row, with the name, rules and phases filled in
// from the library template (library plans) or from the row itself (AI plans).
async function fetchUserPlan(userId) {
  const { rows } = await pool.query(
    `SELECT up.id, up.program_id, up.duration_weeks, up.source, up.created_at,
            up.start_date::text AS start_date,
            up.last_adjusted_on::text AS last_adjusted_on,
            COALESCE(up.ai_name, t.name) AS name,
            COALESCE(up.ai_description, t.description) AS description,
            COALESCE(up.ai_progression, t.progression) AS progression,
            COALESCE(up.ai_phases, t.phases) AS phases
     FROM user_plans up
     LEFT JOIN plan_templates t ON t.id = up.plan_template_id
     WHERE up.user_id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}

async function isPaidUser(userId) {
  const { rows } = await pool.query('SELECT plan_tier FROM users WHERE id = $1', [userId]);
  return rows[0]?.plan_tier === 'premium';
}

// Which week of the plan `today` falls in. Compares calendar dates, not clock
// times, so week boundaries don't drift with the time of day.
function planWeek(plan, today) {
  const rawWeek = Math.floor(Math.max(daysBetween(plan.start_date, today), 0) / 7) + 1;
  return {
    completed: rawWeek > plan.duration_weeks,
    weekNumber: Math.min(rawWeek, plan.duration_weeks),
  };
}

function toPublicAdjustment(row) {
  return {
    id: row.id,
    weekNumber: row.week_number,
    summary: row.summary,
    changes: row.changes,
    createdAt: row.created_at,
  };
}

// Builds a program (days + exercises) owned by the user inside an open
// transaction. Used by adopting a library plan and by writing an AI plan.
async function createProgramFromDays(client, userId, name, description, days) {
  const { rows: programRows } = await client.query(
    'INSERT INTO programs (user_id, name, description) VALUES ($1, $2, $3) RETURNING id',
    [userId, name, description]
  );
  const programId = programRows[0].id;
  // The day the app should open first — day 1 of the new program.
  let firstDayId = null;

  for (const [dayIndex, day] of days.entries()) {
    const { rows: dayRows } = await client.query(
      'INSERT INTO program_days (program_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id',
      [programId, day.name, dayIndex]
    );
    if (dayIndex === 0) firstDayId = dayRows[0].id;
    for (const [exIndex, ex] of day.exercises.entries()) {
      await client.query(
        `INSERT INTO program_exercises (program_day_id, name, target_sets, target_reps, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [dayRows[0].id, ex.name, ex.targetSets, ex.targetReps, exIndex]
      );
    }
  }
  return { programId, firstDayId };
}

// Locks the user's own account row for the rest of the transaction (so two
// requests at once line up one behind the other) and reads the user's AI
// calls, all by the server's own day (never the device's):
// - total / adjusts: today's calls, for the daily cap
// - writeRunning: a plan-write started moments ago that hasn't finished
// - adjustRunning: a weekly adjustment started moments ago that hasn't finished
// - lastWriteOn: the server day of the newest successful plan-write (kept
//   even if the user has since switched to a library plan)
async function readAiAttempts(client, userId, serverToday) {
  await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const { rows } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE attempted_on = $2::date)::integer AS total,
       COUNT(*) FILTER (WHERE attempted_on = $2::date AND kind = 'adjust')::integer AS adjusts,
       COALESCE(BOOL_OR(kind = 'write' AND NOT succeeded
                        AND created_at > now() - $3::interval), false) AS write_running,
       COALESCE(BOOL_OR(kind = 'adjust' AND NOT succeeded
                        AND created_at > now() - $3::interval), false) AS adjust_running,
       (MAX(attempted_on) FILTER (WHERE kind = 'write' AND succeeded))::text AS last_write_on
     FROM ai_plan_attempts
     WHERE user_id = $1`,
    [userId, serverToday, WRITE_IN_PROGRESS_WINDOW]
  );
  const row = rows[0];
  return {
    total: row.total,
    adjusts: row.adjusts,
    writeRunning: row.write_running,
    adjustRunning: row.adjust_running,
    lastWriteOn: row.last_write_on,
  };
}

async function recordAiAttempt(client, userId, kind, serverToday) {
  const { rows } = await client.query(
    `INSERT INTO ai_plan_attempts (user_id, attempted_on, kind) VALUES ($1, $2::date, $3) RETURNING id`,
    [userId, serverToday, kind]
  );
  return rows[0].id;
}

// The user's own program as the AI sees it: day names and exercises.
async function fetchProgramForAi(userId, programId) {
  const { rows } = await pool.query(
    `SELECT pd.id AS day_id, pd.name AS day_name, pe.name, pe.target_sets, pe.target_reps
     FROM program_days pd
     JOIN programs p ON p.id = pd.program_id
     LEFT JOIN program_exercises pe ON pe.program_day_id = pd.id
     WHERE pd.program_id = $1 AND p.user_id = $2
     ORDER BY pd.sort_order, pe.sort_order`,
    [programId, userId]
  );
  const days = new Map();
  for (const row of rows) {
    if (!days.has(row.day_id)) days.set(row.day_id, { name: row.day_name, exercises: [] });
    if (row.name) {
      days.get(row.day_id).exercises.push({
        name: row.name,
        targetSets: row.target_sets,
        targetReps: row.target_reps,
      });
    }
  }
  return [...days.values()];
}

// The last 7 days of training, weigh-ins and recovery — the only logs the AI
// ever sees. No food data, no free-text notes.
async function fetchWeekForAi(userId, today) {
  const from = addDays(today, -7);
  const range = [userId, from, today];

  const { rows: setRows } = await pool.query(
    `SELECT tl.id, tl.date, pd.name AS day_name, e.id AS exercise_id, e.name,
            s.set_number, s.weight, s.reps, s.rpe
     FROM training_logs tl
     LEFT JOIN program_days pd ON pd.id = tl.program_day_id
       AND pd.program_id IN (SELECT id FROM programs WHERE user_id = $1)
     JOIN training_log_exercises e ON e.training_log_id = tl.id
     LEFT JOIN training_log_sets s ON s.training_log_exercise_id = e.id
     WHERE tl.user_id = $1 AND tl.date BETWEEN $2::date AND $3::date
     ORDER BY tl.date, e.sort_order, s.set_number`,
    range
  );
  const logs = new Map();
  for (const row of setRows) {
    if (!logs.has(row.id)) logs.set(row.id, { date: row.date, day: row.day_name, exercises: new Map() });
    const exercises = logs.get(row.id).exercises;
    if (!exercises.has(row.exercise_id)) exercises.set(row.exercise_id, { name: row.name, sets: [] });
    if (row.set_number != null) {
      exercises.get(row.exercise_id).sets.push({
        weight: row.weight == null ? null : Number(row.weight),
        reps: row.reps,
        rpe: row.rpe == null ? null : Number(row.rpe),
      });
    }
  }
  const trainingLogs = [...logs.values()].map((log) => ({ ...log, exercises: [...log.exercises.values()] }));

  const { rows: dayRows } = await pool.query(
    `SELECT date, weight, sleep, steps FROM daily_logs
     WHERE user_id = $1 AND date BETWEEN $2::date AND $3::date
     ORDER BY date`,
    range
  );
  const weighIns = dayRows
    .filter((r) => r.weight != null)
    .map((r) => ({ date: r.date, weight: Number(r.weight) }));

  const { rows: checkinRows } = await pool.query(
    `SELECT d.date, i.region, c.pain_pre, c.pain_during, c.pain_post, c.swelling, c.can_train_tomorrow
     FROM daily_log_injury_checkins c
     JOIN daily_logs d ON d.id = c.daily_log_id
     JOIN injuries i ON i.id = c.injury_id
     WHERE d.user_id = $1 AND i.user_id = $1 AND d.date BETWEEN $2::date AND $3::date
     ORDER BY d.date`,
    range
  );
  const { rows: injuryRows } = await pool.query(
    'SELECT region FROM injuries WHERE user_id = $1 AND archived_at IS NULL',
    [userId]
  );

  const recovery = {
    days: dayRows
      .filter((r) => r.sleep != null || r.steps != null)
      .map((r) => ({ date: r.date, sleepHours: r.sleep == null ? null : Number(r.sleep), steps: r.steps })),
    activeInjuries: injuryRows.map((r) => r.region),
    injuryCheckins: checkinRows.map((r) => ({
      date: r.date,
      region: r.region,
      painBefore: r.pain_pre,
      painDuring: r.pain_during,
      painAfter: r.pain_post,
      swelling: r.swelling,
      canTrainTomorrow: r.can_train_tomorrow,
    })),
  };

  return { trainingLogs, weighIns, recovery };
}

// Applies the AI's changes to the user's own program, inside an open
// transaction. Every change is matched by day name within THIS user's
// program only; a change naming a day that isn't there is skipped. Returns
// the changes that were actually made.
async function applyAdjustment(client, userId, programId, changes) {
  const applied = [];
  for (const change of changes) {
    const { rows: dayRows } = await client.query(
      `SELECT pd.id FROM program_days pd
       JOIN programs p ON p.id = pd.program_id
       WHERE pd.program_id = $1 AND p.user_id = $2 AND LOWER(pd.name) = LOWER($3)
       ORDER BY pd.sort_order
       LIMIT 1`,
      [programId, userId, change.day]
    );
    const dayId = dayRows[0]?.id;
    if (!dayId) continue;

    if (change.action === 'change') {
      if (change.targetSets == null && change.targetReps == null) continue;
      const { rowCount } = await client.query(
        `UPDATE program_exercises
         SET target_sets = COALESCE($3::integer, target_sets),
             target_reps = COALESCE($4::integer, target_reps)
         WHERE program_day_id = $1 AND LOWER(name) = LOWER($2)`,
        [dayId, change.exercise, change.targetSets, change.targetReps]
      );
      if (rowCount > 0) applied.push(change);
    } else if (change.action === 'remove') {
      const { rowCount } = await client.query(
        'DELETE FROM program_exercises WHERE program_day_id = $1 AND LOWER(name) = LOWER($2)',
        [dayId, change.exercise]
      );
      if (rowCount > 0) applied.push(change);
    } else if (change.action === 'add') {
      const { rows: existing } = await client.query(
        'SELECT 1 FROM program_exercises WHERE program_day_id = $1 AND LOWER(name) = LOWER($2)',
        [dayId, change.exercise]
      );
      if (existing.length > 0) continue;
      await client.query(
        `INSERT INTO program_exercises (program_day_id, name, target_sets, target_reps, sort_order)
         VALUES ($1, $2, $3, $4,
                 (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM program_exercises WHERE program_day_id = $1))`,
        [dayId, change.exercise, change.targetSets, change.targetReps]
      );
      applied.push(change);
    }
  }
  return applied;
}

// The weekly re-adjust, run when a paid user with an AI plan opens it 7+
// server days after it was last written or adjusted. Never throws: if anything
// goes wrong the plan is left exactly as it was and the user sees their plan
// as normal. Returns true once the AI has been called, so the caller reads the
// plan again (it was adjusted, restored, or replaced while the AI was thinking).
// `serverToday` drives every cost check; `today` (the device's day) only
// picks the week number and which week of logs the AI sees.
async function runWeeklyAdjustment(userId, plan, today, serverToday) {
  let attemptId;
  try {
    // Claim this week's adjustment in one transaction: at most one 'adjust'
    // try per server day, the daily cap, never while a new plan is being
    // written, and a single UPDATE that only one request can win (so two open
    // tabs can't cause two AI calls).
    attemptId = await withTransaction(async (client) => {
      const attempts = await readAiAttempts(client, userId, serverToday);
      if (attempts.writeRunning || attempts.adjusts > 0 || attempts.total >= DAILY_AI_CAP) return null;
      const { rows } = await client.query(
        `UPDATE user_plans SET last_adjusted_on = $2::date
         WHERE user_id = $1 AND source = 'ai'
           AND last_adjusted_on = $3::date
           AND last_adjusted_on <= $2::date - 7
         RETURNING id`,
        [userId, serverToday, plan.last_adjusted_on]
      );
      if (rows.length === 0) return null;
      return recordAiAttempt(client, userId, 'adjust', serverToday);
    });
  } catch (err) {
    logger.error('Could not start the weekly AI plan adjustment', { error: err });
    return false;
  }
  if (!attemptId) return false;

  try {
    const { weekNumber } = planWeek(plan, today);
    const answers = await fetchQuizAnswers(userId);
    const currentPlan = await fetchProgramForAi(userId, plan.program_id);
    const week = await fetchWeekForAi(userId, today);
    const adjustment = cleanAiAdjustment(
      await aiPlanWriter().adjust({ answers, currentPlan, weekNumber, ...week })
    );

    return await withTransaction(async (client) => {
      // The plan may have been replaced while the AI was thinking. Lock the
      // user's plan row and only save if it is still the program this
      // adjustment was for; otherwise record the finished try with no notice.
      const { rows: current } = await client.query(
        'SELECT program_id FROM user_plans WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      if (current[0]?.program_id !== plan.program_id) {
        await client.query('UPDATE ai_plan_attempts SET succeeded = true WHERE id = $1 AND user_id = $2', [
          attemptId,
          userId,
        ]);
        return true;
      }
      const applied = await applyAdjustment(client, userId, plan.program_id, adjustment.changes);
      await client.query(
        `INSERT INTO ai_plan_adjustments (user_id, week_number, summary, changes)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [userId, weekNumber, adjustment.summary, JSON.stringify(applied)]
      );
      await client.query('UPDATE ai_plan_attempts SET succeeded = true WHERE id = $1 AND user_id = $2', [
        attemptId,
        userId,
      ]);
      return true;
    });
  } catch (err) {
    // Put the old date back so the plan is exactly as it was — only on the
    // program this adjustment claimed, never on a plan that replaced it. The
    // failed try stays recorded, so it is retried at most once a day.
    logger.warn('The weekly AI plan adjustment failed; the plan was left unchanged', { error: err });
    try {
      await pool.query(
        `UPDATE user_plans SET last_adjusted_on = $3::date
         WHERE user_id = $1 AND source = 'ai' AND last_adjusted_on = $2::date AND program_id = $4::uuid`,
        [userId, serverToday, plan.last_adjusted_on, plan.program_id]
      );
    } catch (restoreErr) {
      logger.error('Could not restore the plan after a failed AI adjustment', { error: restoreErr });
    }
    // Read the plan again: it may have been replaced while the AI was thinking.
    return true;
  }
}

router.get('/my-plan', asyncHandler(async (req, res) => {
  // "Today" is the user's own day (?today= from the device, else Oman's day),
  // so a new week starts at the user's midnight, not four hours later.
  const today = resolveToday(req.query.today);
  // The server's own day: every cost check uses this, never the device's.
  const serverToday = todayIn();
  const aiPlan = { enabled: isAiPlanGenerationEnabled(), paid: await isPaidUser(req.userId) };

  let plan = await fetchUserPlan(req.userId);
  if (!plan) return res.json({ plan: null, aiPlan });

  // The weekly re-adjust. Only for a paying user with an AI plan, and never
  // for a free user — someone who cancelled keeps their last AI plan as it is.
  if (
    aiPlan.paid &&
    aiPlan.enabled &&
    plan.source === 'ai' &&
    plan.last_adjusted_on &&
    daysBetween(plan.last_adjusted_on, serverToday) >= 7
  ) {
    const reread = await runWeeklyAdjustment(req.userId, plan, today, serverToday);
    if (reread) plan = await fetchUserPlan(req.userId);
    // The plan may have been removed while the AI was thinking.
    if (!plan) return res.json({ plan: null, aiPlan });
  }

  const { completed, weekNumber } = planWeek(plan, today);
  const targets = weekTargets(
    { progression: plan.progression ?? {}, phases: plan.phases ?? [] },
    weekNumber,
    plan.duration_weeks
  );

  // The newest adjustment of THIS plan (older plans' history stays in the
  // history list but doesn't show as this plan's notice).
  const { rows: adjustmentRows } = await pool.query(
    `SELECT id, week_number, summary, changes, created_at
     FROM ai_plan_adjustments
     WHERE user_id = $1 AND created_at >= $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [req.userId, plan.created_at]
  );
  const latest = adjustmentRows[0];
  const adjustedThisWeek = Boolean(latest)
    && daysBetween(todayIn(DEFAULT_TIME_ZONE, new Date(latest.created_at)), serverToday) < 7;

  res.json({
    plan: {
      name: plan.name,
      description: plan.description,
      programId: plan.program_id,
      startDate: plan.start_date,
      durationWeeks: plan.duration_weeks,
      completed,
      ...targets,
      source: plan.source,
      lastAdjustedOn: plan.last_adjusted_on,
      adjustedThisWeek,
      latestAdjustment: latest ? toPublicAdjustment(latest) : null,
    },
    aiPlan,
  });
}));

router.delete('/my-plan', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM user_plans WHERE user_id = $1', [req.userId]);
  res.status(204).end();
}));

// Write a new AI plan from the quiz answers (paid accounts only).
router.post('/ai', asyncHandler(async (req, res) => {
  // Free accounts are refused before anything else, and the AI is never called.
  if (!(await isPaidUser(req.userId))) return sendAiError(res, 'paid');
  if (!isAiPlanGenerationEnabled()) return sendAiError(res, 'disabled');

  // The device's day only sets the plan's start (its week numbers). It must be
  // today somewhere on Earth, so an old date can't be used to game anything.
  const today = resolveToday(req.query.today);
  const rawStartDate = req.body?.startDate;
  const startDate = rawStartDate == null || rawStartDate === ''
    ? today
    : nearToday(rawStartDate, 'startDate');
  // Every cost check below uses the server's own day.
  const serverToday = todayIn();

  // One locked transaction decides and claims the AI call, so two requests at
  // once line up and only the first reaches the AI: the 7-day rule (from the
  // last successful write, even if a library plan was adopted since), a
  // write or weekly adjustment that is still running, then the daily cap.
  const claim = await withTransaction(async (client) => {
    const attempts = await readAiAttempts(client, req.userId, serverToday);
    if (attempts.lastWriteOn && daysBetween(attempts.lastWriteOn, serverToday) < AI_WRITE_EVERY_DAYS) {
      return { error: 'recent' };
    }
    if (attempts.writeRunning || attempts.adjustRunning) return { error: 'running' };
    if (attempts.total >= DAILY_AI_CAP) return { error: 'limit' };
    return { attemptId: await recordAiAttempt(client, req.userId, 'write', serverToday) };
  });
  if (claim.error) return sendAiError(res, claim.error);
  const { attemptId } = claim;

  let plan;
  try {
    const answers = await fetchQuizAnswers(req.userId);
    plan = cleanAiPlan(await aiPlanWriter().generate(answers, PLAN_WEEKS));
  } catch (err) {
    logger.warn('The AI plan writer failed; the current plan was left unchanged', { error: err });
    return sendAiError(res, 'failed');
  }

  const { programId, firstDayId } = await withTransaction(async (client) => {
    const created = await createProgramFromDays(client, req.userId, plan.name, plan.description, plan.days);
    // The new AI plan replaces the current plan (the old program stays).
    await client.query('DELETE FROM user_plans WHERE user_id = $1', [req.userId]);
    await client.query(
      `INSERT INTO user_plans
         (user_id, plan_template_id, program_id, start_date, duration_weeks, source, last_adjusted_on,
          ai_name, ai_description, ai_progression, ai_phases)
       VALUES ($1, NULL, $2, $3::date, $4, 'ai', $9::date, $5, $6, $7::jsonb, $8::jsonb)`,
      [
        req.userId,
        created.programId,
        startDate,
        PLAN_WEEKS,
        plan.name,
        plan.description,
        JSON.stringify(plan.progression),
        JSON.stringify(plan.phases),
        serverToday,
      ]
    );
    await client.query('UPDATE ai_plan_attempts SET succeeded = true WHERE id = $1 AND user_id = $2', [
      attemptId,
      req.userId,
    ]);
    return created;
  });

  res.status(201).json({ programId, firstDayId, durationWeeks: PLAN_WEEKS, startDate, source: 'ai' });
}));

// The user's own weekly adjustments, newest first.
router.get('/ai/history', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, week_number, summary, changes, created_at
     FROM ai_plan_adjustments
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 200`,
    [req.userId]
  );
  res.json({ adjustments: rows.map(toPublicAdjustment) });
}));

// --- Library templates by id (after every literal path) -------------------

router.get('/templates/:id', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return planNotFound(res);

  const { rows } = await pool.query('SELECT * FROM plan_templates WHERE id = $1', [req.params.id]);
  if (!rows[0]) {
    return planNotFound(res);
  }
  const days = await fetchTemplateDays(rows[0].id);
  res.json({ template: { ...toPublicTemplate(rows[0]), days } });
}));


// Everyone, free or paid, is adopted onto the whole plan. Any durationWeeks
// in the request is ignored — there is only one length now.
router.post('/templates/:id/adopt', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return planNotFound(res);

  const { rows: templateRows } = await pool.query('SELECT * FROM plan_templates WHERE id = $1', [
    req.params.id,
  ]);
  const template = templateRows[0];
  if (!template) {
    return planNotFound(res);
  }

  // If no start date is given, default to today (Oman's day, not the
  // server's UTC day; the screens always send their own). If one IS given, run it through
  // the real-calendar validator so an impossible-but-well-shaped date (e.g.
  // 2026-13-45) fails with a clean 400 instead of a Postgres date error (a 500).
  const rawStartDate = req.body?.startDate;
  const startDate = rawStartDate == null || rawStartDate === ''
    ? todayIn()
    : validate.isoDate(rawStartDate, 'startDate');

  const days = await fetchTemplateDays(template.id);

  const { programId, firstDayId } = await withTransaction(async (client) => {
    const created = await createProgramFromDays(client, req.userId, template.name, template.description, days);

    // Starting a new plan replaces the current one (the old program stays).
    await client.query('DELETE FROM user_plans WHERE user_id = $1', [req.userId]);
    await client.query(
      `INSERT INTO user_plans (user_id, plan_template_id, program_id, start_date, duration_weeks, source)
       VALUES ($1, $2, $3, $4, $5, 'library')`,
      [req.userId, template.id, created.programId, startDate, PLAN_WEEKS]
    );

    return created;
  });

  res.status(201).json({ programId, firstDayId, durationWeeks: PLAN_WEEKS, startDate });
}));

export default router;
