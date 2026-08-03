import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import * as validate from '../lib/validate.js';
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
    experienceLevel: row.experience_level,
    trainingGoal: row.training_goal,
    equipment: row.equipment,
    daysPerWeek: row.days_per_week,
  };
}

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [req.userId]);
  res.json({ settings: rows[0] ? toPublicSettings(rows[0]) : null });
}));

router.put('/', asyncHandler(async (req, res) => {
  const {
    startWeight, targetWeight, targetDate, height, age, stepGoal, sleepGoal,
    experienceLevel, trainingGoal, equipment, daysPerWeek,
  } = req.body ?? {};

  // Every stored number/date is optional, but if given it must be a real,
  // sensible value. This rejects text, negatives, impossible dates (e.g.
  // 2026-13-45) and absurd/huge numbers with a clean 400 instead of a server
  // error or a silently-stored bad value — matching the daily-log endpoints.
  const cleanStartWeight = validate.nonNegativeNumber(startWeight, 'start weight', { optional: true, max: 2000 });
  const cleanTargetWeight = validate.nonNegativeNumber(targetWeight, 'target weight', { optional: true, max: 2000 });
  const cleanTargetDate = targetDate == null || targetDate === '' ? null : validate.isoDate(targetDate, 'target date');
  const cleanHeight = validate.nonNegativeNumber(height, 'height', { optional: true, max: 400 });
  const cleanAge = validate.nonNegativeNumber(age, 'age', { optional: true, integer: true, max: 150 });
  const cleanStepGoal = validate.nonNegativeNumber(stepGoal, 'step goal', { optional: true, integer: true, max: 1000000 });
  const cleanSleepGoal = validate.nonNegativeNumber(sleepGoal, 'sleep goal', { optional: true, max: 24 });
  const cleanDaysPerWeek = validate.nonNegativeNumber(daysPerWeek, 'days per week', { optional: true, integer: true, max: 7 });

  // The quiz fields keep their old values when a form doesn't send them,
  // so the plain settings form can't wipe out someone's quiz answers.
  const { rows } = await pool.query(
    `UPDATE user_settings
     SET start_weight = $2, target_weight = $3, target_date = $4, height = $5, age = $6, step_goal = $7, sleep_goal = $8,
         experience_level = COALESCE($9, experience_level),
         training_goal = COALESCE($10, training_goal),
         equipment = COALESCE($11, equipment),
         days_per_week = COALESCE($12::integer, days_per_week)
     WHERE user_id = $1
     RETURNING *`,
    [req.userId, cleanStartWeight, cleanTargetWeight, cleanTargetDate, cleanHeight, cleanAge, cleanStepGoal, cleanSleepGoal,
      experienceLevel ?? null, trainingGoal ?? null, equipment ?? null, cleanDaysPerWeek]
  );

  res.json({ settings: toPublicSettings(rows[0]) });
}));

export default router;
