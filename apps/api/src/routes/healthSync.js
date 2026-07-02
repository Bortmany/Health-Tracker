import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ENTRIES = 90;

router.use(requireAuth);

// Phone apps (Apple Health / Health Connect) push batches of readings here.
// Device data must never clobber a value the user typed in manually — it
// only fills in fields that are currently empty for that date.
router.post('/', asyncHandler(async (req, res) => {
  const { entries } = req.body ?? {};

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({
      error: { message: 'entries must be a non-empty list of daily readings', code: 'INVALID_INPUT' },
    });
  }
  if (entries.length > MAX_ENTRIES) {
    return res.status(400).json({
      error: { message: `You can only sync up to ${MAX_ENTRIES} days at a time`, code: 'INVALID_INPUT' },
    });
  }
  for (const entry of entries) {
    if (!DATE_RE.test(entry?.date)) {
      return res.status(400).json({
        error: { message: 'Every entry needs a date in YYYY-MM-DD format', code: 'INVALID_INPUT' },
      });
    }
    // Reject bad readings with a clear message instead of a server error.
    for (const field of ['weight', 'sleep']) {
      if (entry[field] != null && !Number.isFinite(Number(entry[field]))) {
        return res.status(400).json({
          error: { message: `${field} must be a number (entry for ${entry.date})`, code: 'INVALID_INPUT' },
        });
      }
    }
    for (const field of ['steps', 'calories']) {
      if (entry[field] != null && !Number.isInteger(Number(entry[field]))) {
        return res.status(400).json({
          error: { message: `${field} must be a whole number (entry for ${entry.date})`, code: 'INVALID_INPUT' },
        });
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const entry of entries) {
      const { date, weight, steps, calories, sleep } = entry;
      await client.query(
        `INSERT INTO daily_logs (user_id, date, weight, steps, calories, sleep)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, date) DO UPDATE SET
           weight = COALESCE(daily_logs.weight, EXCLUDED.weight),
           steps = COALESCE(daily_logs.steps, EXCLUDED.steps),
           calories = COALESCE(daily_logs.calories, EXCLUDED.calories),
           sleep = COALESCE(daily_logs.sleep, EXCLUDED.sleep)`,
        [req.userId, date, weight ?? null, steps ?? null, calories ?? null, sleep ?? null]
      );
    }

    await client.query('COMMIT');
    res.json({ synced: entries.length });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

export default router;
