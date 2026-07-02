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
  res.json({ exercises: rows.map(toPublicExercise) });
}));

export default router;
