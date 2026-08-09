import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { normalizeCheckins } from '../lib/injuryCheckins.js';
import * as validate from '../lib/validate.js';
import { withTransaction } from '../lib/withTransaction.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Guard against a runaway form stuffing thousands of rows into one day.
const MAX_ENTRIES = 100;

function toPublicLog(row) {
  if (!row) return null;
  return {
    date: row.date,
    weight: row.weight,
    waist: row.waist,
    sleep: row.sleep,
    hrv: row.hrv,
    recovery: row.recovery,
    strain: row.strain,
    steps: row.steps,
    calories: row.calories,
    notes: row.notes,
  };
}

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const from = validate.queryDate(req.query.from, 'from', '1970-01-01');
  const to = validate.queryDate(req.query.to, 'to', '9999-12-31');

  const { rows } = await pool.query(
    `SELECT * FROM daily_logs WHERE user_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date`,
    [req.userId, from, to]
  );
  res.json({ logs: rows.map(toPublicLog) });
}));

// One query for the Dashboard's weekly habit ring instead of one request per day.
router.get('/habit-summary', asyncHandler(async (req, res) => {
  const from = validate.queryDate(req.query.from, 'from', '1970-01-01');
  const to = validate.queryDate(req.query.to, 'to', '9999-12-31');

  const { rows } = await pool.query(
    `SELECT dl.date,
            COUNT(dlh.habit_id)::int AS possible,
            COUNT(dlh.habit_id) FILTER (WHERE dlh.completed)::int AS completed
     FROM daily_logs dl
     JOIN daily_log_habits dlh ON dlh.daily_log_id = dl.id
     WHERE dl.user_id = $1 AND dl.date BETWEEN $2 AND $3
     GROUP BY dl.date
     ORDER BY dl.date`,
    [req.userId, from, to]
  );
  res.json({ days: rows.map((r) => ({ date: r.date, possible: r.possible, completed: r.completed })) });
}));

// Current streak of consecutive days with a log, counting back from today.
// A streak that ended yesterday (no entry logged yet today) still counts.
router.get('/streak', asyncHandler(async (req, res) => {
  // date::text keeps calendar dates as plain strings, avoiding timezone
  // shifts that happen when the database driver turns them into JS Dates.
  const { rows } = await pool.query(
    'SELECT date::text AS date FROM daily_logs WHERE user_id = $1 ORDER BY date DESC LIMIT 400',
    [req.userId]
  );

  const dates = new Set(rows.map((r) => r.date));

  const cursor = new Date();
  let streak = 0;

  // If there's no entry for today yet, the streak still counts as long as
  // yesterday has one, so start checking from today and stop at the first gap
  // (but don't let a missing "today" alone break a streak that ended yesterday).
  if (!dates.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  res.json({ streak });
}));

router.get('/:date', asyncHandler(async (req, res) => {
  // Rejects both wrong shapes and impossible-but-well-shaped dates (e.g.
  // 2026-13-45) with a clean 400 instead of letting Postgres throw a 500.
  const date = validate.isoDate(req.params.date);

  const { rows: logRows } = await pool.query('SELECT * FROM daily_logs WHERE user_id = $1 AND date = $2', [
    req.userId,
    date,
  ]);
  const log = logRows[0] ?? null;

  const { rows: habitRows } = await pool.query(
    `SELECT h.id AS habit_id, h.label, COALESCE(dlh.completed, false) AS completed
     FROM habits h
     LEFT JOIN daily_log_habits dlh ON dlh.habit_id = h.id AND dlh.daily_log_id = $2
     WHERE h.user_id = $1 AND h.archived_at IS NULL
     ORDER BY h.sort_order, h.label`,
    [req.userId, log?.id ?? null]
  );

  const { rows: activityRows } = log
    ? await pool.query('SELECT * FROM daily_log_activities WHERE daily_log_id = $1', [log.id])
    : { rows: [] };

  const { rows: injuryRows } = await pool.query(
    `SELECT i.id AS injury_id, i.region, c.pain_pre, c.pain_during, c.pain_post, c.swelling, c.can_train_tomorrow
     FROM injuries i
     LEFT JOIN daily_log_injury_checkins c ON c.injury_id = i.id AND c.daily_log_id = $2
     WHERE i.user_id = $1 AND i.archived_at IS NULL
     ORDER BY i.created_at`,
    [req.userId, log?.id ?? null]
  );

  res.json({
    date,
    log: toPublicLog(log),
    habits: habitRows.map((r) => ({ habitId: r.habit_id, label: r.label, completed: r.completed })),
    activities: activityRows.map((r) => ({
      id: r.id,
      activityId: r.activity_id,
      name: r.name,
      durationMinutes: r.duration_minutes,
    })),
    injuryCheckins: injuryRows.map((r) => ({
      injuryId: r.injury_id,
      region: r.region,
      painPre: r.pain_pre,
      painDuring: r.pain_during,
      painPost: r.pain_post,
      swelling: r.swelling,
      canTrainTomorrow: r.can_train_tomorrow,
    })),
  });
}));

router.put('/:date', asyncHandler(async (req, res) => {
  // Rejects impossible dates (e.g. 2026-13-45) with a 400 before any query runs.
  const date = validate.isoDate(req.params.date);

  const {
    weight, waist, sleep, hrv, recovery, strain, steps, calories, notes,
    habits = [], activities = [], injuryCheckins = [],
  } = req.body ?? {};

  // Every stored number is optional, but if given it must be a finite,
  // non-negative value inside a sane range. This rejects text, NaN, Infinity
  // (e.g. 1e400) and absurd values that would otherwise break the charts.
  const cleanWeight = validate.nonNegativeNumber(weight, 'weight', { optional: true, max: 2000 });
  const cleanWaist = validate.nonNegativeNumber(waist, 'waist', { optional: true, max: 500 });
  const cleanSleep = validate.nonNegativeNumber(sleep, 'sleep', { optional: true, max: 48 });
  const cleanHrv = validate.nonNegativeNumber(hrv, 'HRV', { optional: true, max: 1000 });
  const cleanRecovery = validate.nonNegativeNumber(recovery, 'recovery', { optional: true, max: 100 });
  const cleanStrain = validate.nonNegativeNumber(strain, 'strain', { optional: true, max: 100 });
  const cleanSteps = validate.nonNegativeNumber(steps, 'steps', { optional: true, integer: true, max: 1000000 });
  const cleanCalories = validate.nonNegativeNumber(calories, 'calories', { optional: true, integer: true, max: 100000 });
  const cleanNotes = validate.stringLength(notes, 'notes', { optional: true, max: 2000 });

  if (!Array.isArray(habits) || !Array.isArray(activities)) {
    throw new validate.ValidationError('habits and activities must be lists');
  }
  if (habits.length > MAX_ENTRIES || activities.length > MAX_ENTRIES) {
    throw new validate.ValidationError(`You can log at most ${MAX_ENTRIES} entries for one day`);
  }

  // Validate the nested rows up front so a bad value fails cleanly before we
  // start writing to the database.
  const cleanHabits = [];
  for (const h of habits) {
    if (!h?.habitId) continue;
    cleanHabits.push({
      habitId: validate.uuid(h.habitId, 'habit id'),
      completed: Boolean(h.completed),
    });
  }

  const cleanActivities = [];
  for (const a of activities) {
    if (!a?.activityId && !a?.name) continue;
    cleanActivities.push({
      activityId: validate.uuid(a.activityId, 'activity id', { optional: true }),
      name: validate.stringLength(a.name, 'activity name', { optional: true, max: 200 }),
      durationMinutes: validate.nonNegativeNumber(a.durationMinutes, 'activity duration', {
        optional: true, integer: true, max: 100000,
      }),
    });
  }

  const normalizedCheckins = normalizeCheckins(injuryCheckins);
  for (const c of normalizedCheckins) {
    validate.uuid(c.injuryId, 'injury id');
  }

  // A valid-shaped but non-existent (or someone else's) habit/injury/activity id
  // would otherwise reach the INSERT below and throw an uncaught foreign key
  // violation (a 500). Check ownership up front so a bad id gets a clean 400.
  if (cleanHabits.length) {
    const { rows: ownedHabits } = await pool.query(
      'SELECT id FROM habits WHERE user_id = $1 AND id = ANY($2::uuid[])',
      [req.userId, cleanHabits.map((h) => h.habitId)]
    );
    const ownedHabitIds = new Set(ownedHabits.map((r) => r.id));
    for (const h of cleanHabits) {
      if (!ownedHabitIds.has(h.habitId)) {
        throw new validate.ValidationError('habit id must belong to your account');
      }
    }
  }

  const cleanActivityIds = cleanActivities.map((a) => a.activityId).filter(Boolean);
  if (cleanActivityIds.length) {
    const { rows: ownedActivities } = await pool.query(
      'SELECT id FROM activities WHERE user_id = $1 AND id = ANY($2::uuid[])',
      [req.userId, cleanActivityIds]
    );
    const ownedActivityIds = new Set(ownedActivities.map((r) => r.id));
    for (const id of cleanActivityIds) {
      if (!ownedActivityIds.has(id)) {
        throw new validate.ValidationError('activity id must belong to your account');
      }
    }
  }

  if (normalizedCheckins.length) {
    const { rows: ownedInjuries } = await pool.query(
      'SELECT id FROM injuries WHERE user_id = $1 AND id = ANY($2::uuid[])',
      [req.userId, normalizedCheckins.map((c) => c.injuryId)]
    );
    const ownedInjuryIds = new Set(ownedInjuries.map((r) => r.id));
    for (const c of normalizedCheckins) {
      if (!ownedInjuryIds.has(c.injuryId)) {
        throw new validate.ValidationError('injury id must belong to your account');
      }
    }
  }

  const log = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO daily_logs (user_id, date, weight, waist, sleep, hrv, recovery, strain, steps, calories, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, date) DO UPDATE SET
         weight = EXCLUDED.weight, waist = EXCLUDED.waist, sleep = EXCLUDED.sleep, hrv = EXCLUDED.hrv,
         recovery = EXCLUDED.recovery, strain = EXCLUDED.strain, steps = EXCLUDED.steps,
         calories = EXCLUDED.calories, notes = EXCLUDED.notes
       RETURNING *`,
      [req.userId, date, cleanWeight, cleanWaist, cleanSleep, cleanHrv, cleanRecovery,
        cleanStrain, cleanSteps, cleanCalories, cleanNotes]
    );
    const log = rows[0];

    await client.query('DELETE FROM daily_log_habits WHERE daily_log_id = $1', [log.id]);
    for (const h of cleanHabits) {
      await client.query(
        'INSERT INTO daily_log_habits (daily_log_id, habit_id, completed) VALUES ($1, $2, $3)',
        [log.id, h.habitId, h.completed]
      );
    }

    await client.query('DELETE FROM daily_log_activities WHERE daily_log_id = $1', [log.id]);
    for (const a of cleanActivities) {
      await client.query(
        'INSERT INTO daily_log_activities (daily_log_id, activity_id, name, duration_minutes) VALUES ($1, $2, $3, $4)',
        [log.id, a.activityId, a.name, a.durationMinutes]
      );
    }

    await client.query('DELETE FROM daily_log_injury_checkins WHERE daily_log_id = $1', [log.id]);
    for (const c of normalizedCheckins) {
      await client.query(
        `INSERT INTO daily_log_injury_checkins
           (daily_log_id, injury_id, pain_pre, pain_during, pain_post, swelling, can_train_tomorrow)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [log.id, c.injuryId, c.painPre, c.painDuring, c.painPost, c.swelling, c.canTrainTomorrow]
      );
    }

    return log;
  });

  res.json({ log: toPublicLog(log) });
}));

export default router;
