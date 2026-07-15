import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function toPublicExercise(row) {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    equipment: row.equipment,
    instructions: row.instructions,
  };
}

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const search = req.query.search ?? '';

  const { rows } = await pool.query(
    `SELECT * FROM exercise_library WHERE name ILIKE '%' || $1 || '%' ORDER BY name LIMIT 50`,
    [search]
  );
  // The exercise library is the same reference data for every user, so it's safe
  // to let browsers/CDNs cache it for a few minutes. (Never do this for a route
  // that returns one user's own data.)
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ exercises: rows.map(toPublicExercise) });
}));

export default router;
