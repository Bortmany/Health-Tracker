import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { computeHeatmap } from '../lib/muscleHeatmap.js';
import { resolveToday } from '../lib/userToday.js';
import { requireAuth } from '../middleware/auth.js';

// Every exercise name with muscle tags: the library's own, plus the seeded
// plans' exercises (library first, so a name in both is only counted once).
const TAGGED_EXERCISES = `WITH tagged AS (
  SELECT name, primary_muscles, secondary_muscles FROM exercise_library
  UNION ALL
  SELECT t.name, t.primary_muscles, t.secondary_muscles FROM exercise_muscle_tags t
  WHERE NOT EXISTS (SELECT 1 FROM exercise_library l WHERE LOWER(l.name) = LOWER(t.name))
)`;

const router = Router();

router.use(requireAuth);

// GET /api/muscle-heatmap?days=30&today=YYYY-MM-DD
// `today` is the day on the user's device (Oman time for Oman users); the
// window and the fading are counted back from it, never from the UTC day.
// Summarises the signed-in user's recent training into a 0-100 score per
// muscle (recent sets count more; a main mover counts double a helper),
// plus a list of logged exercise names that have no muscle tags.
router.get('/', asyncHandler(async (req, res) => {
  const raw = req.query.days;
  const days = raw === undefined ? 30 : (/^\d+$/.test(raw) ? Number(raw) : NaN);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return res.status(400).json({
      error: { message: 'days must be a whole number between 1 and 90', code: 'VALIDATION' },
    });
  }
  const today = resolveToday(req.query.today);

  // One row per (muscle, role, exercise, workout date) for exercises we can
  // match to the library or the plans' tagged exercises (case-insensitive on name).
  const { rows: matchedRows } = await pool.query(
    `${TAGGED_EXERCISES}
     SELECT mu.muscle,
            mu.role_weight,
            el.name,
            tl.date::text AS date,
            COUNT(tls.id)::int AS sets,
            COALESCE(SUM(tls.weight * tls.reps), 0)::float AS volume
     FROM training_logs tl
     JOIN training_log_exercises tle ON tle.training_log_id = tl.id
     JOIN training_log_sets tls ON tls.training_log_exercise_id = tle.id
     JOIN tagged el ON LOWER(el.name) = LOWER(tle.name)
     CROSS JOIN LATERAL (
       SELECT unnest(el.primary_muscles) AS muscle, 1.0 AS role_weight
       UNION ALL
       SELECT unnest(el.secondary_muscles), 0.5
     ) mu
     WHERE tl.user_id = $1 AND tl.date >= $3::date - $2::integer
     GROUP BY mu.muscle, mu.role_weight, el.name, tl.date`,
    [req.userId, days, today]
  );

  // Logged exercise names neither the library nor the plan tags know — surfaced so the user
  // understands why they don't light up the map.
  const { rows: unmatchedRows } = await pool.query(
    `${TAGGED_EXERCISES}
     SELECT tle.name,
            COUNT(tls.id)::int AS sets,
            MAX(tl.date)::text AS last_logged
     FROM training_logs tl
     JOIN training_log_exercises tle ON tle.training_log_id = tl.id
     JOIN training_log_sets tls ON tls.training_log_exercise_id = tle.id
     LEFT JOIN tagged el ON LOWER(el.name) = LOWER(tle.name)
     WHERE tl.user_id = $1 AND tl.date >= $3::date - $2::integer AND el.name IS NULL
     GROUP BY tle.name
     ORDER BY sets DESC
     LIMIT 10`,
    [req.userId, days, today]
  );

  res.json({
    days,
    muscles: computeHeatmap(matchedRows, today),
    unmatched: unmatchedRows.map((r) => ({
      name: r.name,
      sets: r.sets,
      lastLogged: r.last_logged,
    })),
  });
}));

export default router;
