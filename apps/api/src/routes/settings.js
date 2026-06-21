import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function toPublicSettings(row) {
  return {
    startWeight: row.start_weight,
    targetWeight: row.target_weight,
    targetDate: row.target_date,
    height: row.height,
    age: row.age,
    stepGoal: row.step_goal,
    sleepGoal: row.sleep_goal,
  };
}

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [req.userId]);
  res.json({ settings: rows[0] ? toPublicSettings(rows[0]) : null });
}));

router.put('/', asyncHandler(async (req, res) => {
  const { startWeight, targetWeight, targetDate, height, age, stepGoal, sleepGoal } = req.body ?? {};

  const { rows } = await pool.query(
    `UPDATE user_settings
     SET start_weight = $2, target_weight = $3, target_date = $4, height = $5, age = $6, step_goal = $7, sleep_goal = $8
     WHERE user_id = $1
     RETURNING *`,
    [req.userId, startWeight, targetWeight, targetDate, height, age, stepGoal, sleepGoal]
  );

  res.json({ settings: toPublicSettings(rows[0]) });
}));

export default router;
