import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { normalizeCheckins } from '../lib/injuryCheckins.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const from = DATE_RE.test(req.query.from) ? req.query.from : '1970-01-01';
  const to = DATE_RE.test(req.query.to) ? req.query.to : '9999-12-31';

  const { rows } = await pool.query(
    `SELECT * FROM daily_logs WHERE user_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date`,
    [req.userId, from, to]
  );
  res.json({ logs: rows.map(toPublicLog) });
}));

// One query for the Dashboard's weekly habit ring instead of one request per day.
router.get('/habit-summary', asyncHandler(async (req, res) => {
  const from = DATE_RE.test(req.query.from) ? req.query.from : '1970-01-01';
  const to = DATE_RE.test(req.query.to) ? req.query.to : '9999-12-31';

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
  const { date } = req.params;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: { message: 'date must be YYYY-MM-DD', code: 'INVALID_INPUT' } });
  }

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
  const { date } = req.params;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: { message: 'date must be YYYY-MM-DD', code: 'INVALID_INPUT' } });
  }

  const {
    weight, waist, sleep, hrv, recovery, strain, steps, calories, notes,
    habits = [], activities = [], injuryCheckins = [],
  } = req.body ?? {};

  const normalizedCheckins = normalizeCheckins(injuryCheckins);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO daily_logs (user_id, date, weight, waist, sleep, hrv, recovery, strain, steps, calories, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, date) DO UPDATE SET
         weight = EXCLUDED.weight, waist = EXCLUDED.waist, sleep = EXCLUDED.sleep, hrv = EXCLUDED.hrv,
         recovery = EXCLUDED.recovery, strain = EXCLUDED.strain, steps = EXCLUDED.steps,
         calories = EXCLUDED.calories, notes = EXCLUDED.notes
       RETURNING *`,
      [req.userId, date, weight ?? null, waist ?? null, sleep ?? null, hrv ?? null, recovery ?? null,
        strain ?? null, steps ?? null, calories ?? null, notes ?? null]
    );
    const log = rows[0];

    await client.query('DELETE FROM daily_log_habits WHERE daily_log_id = $1', [log.id]);
    for (const h of habits) {
      if (!h?.habitId) continue;
      await client.query(
        'INSERT INTO daily_log_habits (daily_log_id, habit_id, completed) VALUES ($1, $2, $3)',
        [log.id, h.habitId, Boolean(h.completed)]
      );
    }

    await client.query('DELETE FROM daily_log_activities WHERE daily_log_id = $1', [log.id]);
    for (const a of activities) {
      if (!a?.activityId && !a?.name) continue;
      await client.query(
        'INSERT INTO daily_log_activities (daily_log_id, activity_id, name, duration_minutes) VALUES ($1, $2, $3, $4)',
        [log.id, a.activityId ?? null, a.name ?? null, a.durationMinutes ?? null]
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

    await client.query('COMMIT');
    res.json({ log: toPublicLog(log) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

export default router;
