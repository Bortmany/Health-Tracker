import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import * as validate from '../lib/validate.js';
import { withTransaction } from '../lib/withTransaction.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const MAX_ENTRIES = 90;

router.use(requireAuth);

// Devices often send 0 (or blank) for "no reading", and a stray impossible
// value shouldn't sink a whole 400-day sync. So a weight that is missing, 0,
// not a number, or outside the sane body-weight range is simply skipped for
// that day (null = leave the weight alone); the other readings still sync.
function syncWeight(value) {
  try {
    return validate.bodyWeight(value);
  } catch {
    return null;
  }
}

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
  // Clean every reading up front, the same way the manual daily-log form does:
  // real dates only, and each number finite, non-negative and inside a sane
  // range. The step/calorie caps also stop a huge value from overflowing the
  // integer columns (which used to be a 500). A bad value fails cleanly here
  // before anything is written.
  const cleanEntries = entries.map((entry) => {
    const date = validate.isoDate(entry?.date);
    return {
      date,
      weight: syncWeight(entry?.weight),
      sleep: validate.nonNegativeNumber(entry?.sleep, `sleep (entry for ${date})`, { optional: true, max: 48 }),
      steps: validate.nonNegativeNumber(entry?.steps, `steps (entry for ${date})`, { optional: true, integer: true, max: 1000000 }),
      calories: validate.nonNegativeNumber(entry?.calories, `calories (entry for ${date})`, { optional: true, integer: true, max: 100000 }),
    };
  });

  await withTransaction(async (client) => {
    for (const entry of cleanEntries) {
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
  });

  res.json({ synced: entries.length });
}));

export default router;
