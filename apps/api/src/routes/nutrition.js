import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import * as validate from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Guard against a runaway request stuffing thousands of rows into one day.
const MAX_MEALS = 50;

function toPublicLog(row) {
  if (!row) return null;
  return {
    date: row.date,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    notes: row.notes,
  };
}

function toPublicMeal(row) {
  return {
    id: row.id,
    name: row.name,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
  };
}

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const from = DATE_RE.test(req.query.from) ? req.query.from : '1970-01-01';
  const to = DATE_RE.test(req.query.to) ? req.query.to : '9999-12-31';

  const { rows } = await pool.query(
    'SELECT * FROM nutrition_logs WHERE user_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date',
    [req.userId, from, to]
  );
  res.json({ logs: rows.map(toPublicLog) });
}));

router.get('/:date', asyncHandler(async (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: { message: 'date must be YYYY-MM-DD', code: 'INVALID_INPUT' } });
  }

  const { rows: logRows } = await pool.query(
    'SELECT * FROM nutrition_logs WHERE user_id = $1 AND date = $2',
    [req.userId, date]
  );
  const log = logRows[0] ?? null;

  const { rows: mealRows } = log
    ? await pool.query('SELECT * FROM nutrition_log_meals WHERE nutrition_log_id = $1 ORDER BY sort_order', [log.id])
    : { rows: [] };

  res.json({ date, log: toPublicLog(log), meals: mealRows.map(toPublicMeal) });
}));

router.put('/:date', asyncHandler(async (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: { message: 'date must be YYYY-MM-DD', code: 'INVALID_INPUT' } });
  }

  const { calories, protein, carbs, fat, notes, meals = [] } = req.body ?? {};

  // Validate the day's totals: each macro is optional, but if given it must be a
  // finite, non-negative number. Bad values are rejected with a clear message.
  const cleanCalories = validate.nonNegativeNumber(calories, 'calories', { optional: true, max: 100000 });
  const cleanProtein = validate.nonNegativeNumber(protein, 'protein', { optional: true, max: 100000 });
  const cleanCarbs = validate.nonNegativeNumber(carbs, 'carbs', { optional: true, max: 100000 });
  const cleanFat = validate.nonNegativeNumber(fat, 'fat', { optional: true, max: 100000 });
  const cleanNotes = validate.stringLength(notes, 'notes', { optional: true, max: 2000 });

  if (!Array.isArray(meals)) {
    throw new validate.ValidationError('meals must be a list');
  }
  if (meals.length > MAX_MEALS) {
    throw new validate.ValidationError(`You can log at most ${MAX_MEALS} meals for one day`);
  }
  // Blank rows the form may send are skipped; any meal with a name gets its name
  // and macros validated the same way as the day totals.
  const cleanMeals = [];
  for (const meal of meals) {
    if (meal?.name == null || String(meal.name).trim() === '') continue;
    cleanMeals.push({
      name: validate.stringLength(meal.name, 'meal name', { max: 200 }),
      calories: validate.nonNegativeNumber(meal.calories, 'meal calories', { optional: true, max: 100000 }),
      protein: validate.nonNegativeNumber(meal.protein, 'meal protein', { optional: true, max: 100000 }),
      carbs: validate.nonNegativeNumber(meal.carbs, 'meal carbs', { optional: true, max: 100000 }),
      fat: validate.nonNegativeNumber(meal.fat, 'meal fat', { optional: true, max: 100000 }),
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO nutrition_logs (user_id, date, calories, protein, carbs, fat, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, date) DO UPDATE SET
         calories = EXCLUDED.calories, protein = EXCLUDED.protein, carbs = EXCLUDED.carbs,
         fat = EXCLUDED.fat, notes = EXCLUDED.notes
       RETURNING *`,
      [req.userId, date, cleanCalories, cleanProtein, cleanCarbs, cleanFat, cleanNotes]
    );
    const log = rows[0];

    await client.query('DELETE FROM nutrition_log_meals WHERE nutrition_log_id = $1', [log.id]);
    for (const [index, meal] of cleanMeals.entries()) {
      await client.query(
        `INSERT INTO nutrition_log_meals (nutrition_log_id, name, calories, protein, carbs, fat, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [log.id, meal.name, meal.calories, meal.protein, meal.carbs, meal.fat, index]
      );
    }

    await client.query('COMMIT');
    const { rows: mealRows } = await pool.query(
      'SELECT * FROM nutrition_log_meals WHERE nutrition_log_id = $1 ORDER BY sort_order',
      [log.id]
    );
    res.json({ log: toPublicLog(log), meals: mealRows.map(toPublicMeal) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

export default router;
