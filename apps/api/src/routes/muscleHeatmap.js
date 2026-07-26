import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { computeHeatmap } from '../lib/muscleHeatmap.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

// GET /api/muscle-heatmap?days=30
// Summarises the signed-in user's recent training into a 0-100 score per
// muscle (recent sets count more; a main mover counts double a helper),
// plus a list of logged exercise names the library doesn't recognise.
router.get('/', asyncHandler(async (req, res) => {
  const raw = req.query.days;
  const days = raw === undefined ? 30 : (/^\d+$/.test(raw) ? Number(raw) : NaN);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return res.status(400).json({
      error: { message: 'days must be a whole number between 1 and 90', code: 'VALIDATION' },
    });
  }

  // One row per (muscle, role, exercise, workout date) for exercises we can
  // match to the library (case-insensitive on name).
  const { rows: matchedRows } = await pool.query(
    `SELECT mu.muscle,
            mu.role_weight,
            el.name,
            tl.date,
            COUNT(tls.id)::int AS sets,
            COALESCE(SUM(tls.weight * tls.reps), 0)::float AS volume
     FROM training_logs tl
     JOIN training_log_exercises tle ON tle.training_log_id = tl.id
     JOIN training_log_sets tls ON tls.training_log_exercise_id = tle.id
     JOIN exercise_library el ON LOWER(el.name) = LOWER(tle.name)
     CROSS JOIN LATERAL (
       SELECT unnest(el.primary_muscles) AS muscle, 1.0 AS role_weight
       UNION ALL
       SELECT unnest(el.secondary_muscles), 0.5
     ) mu
     WHERE tl.user_id = $1 AND tl.date >= CURRENT_DATE - $2::integer
     GROUP BY mu.muscle, mu.role_weight, el.name, tl.date`,
    [req.userId, days]
  );

  // Logged exercise names the library doesn't know — surfaced so the user
  // understands why they don't light up the map.
  const { rows: unmatchedRows } = await pool.query(
    `SELECT tle.name,
            COUNT(tls.id)::int AS sets,
            MAX(tl.date) AS last_logged
     FROM training_logs tl
     JOIN training_log_exercises tle ON tle.training_log_id = tl.id
     JOIN training_log_sets tls ON tls.training_log_exercise_id = tle.id
     LEFT JOIN exercise_library el ON LOWER(el.name) = LOWER(tle.name)
     WHERE tl.user_id = $1 AND tl.date >= CURRENT_DATE - $2::integer AND el.id IS NULL
     GROUP BY tle.name
     ORDER BY sets DESC
     LIMIT 10`,
    [req.userId, days]
  );

  res.json({
    days,
    muscles: computeHeatmap(matchedRows),
    unmatched: unmatchedRows.map((r) => ({
      name: r.name,
      sets: r.sets,
      lastLogged: (typeof r.last_logged === 'string' ? r.last_logged : r.last_logged.toISOString()).slice(0, 10),
    })),
  });
}));

export default router;
