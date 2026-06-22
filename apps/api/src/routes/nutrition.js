import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
      [req.userId, date, calories ?? null, protein ?? null, carbs ?? null, fat ?? null, notes ?? null]
    );
    const log = rows[0];

    await client.query('DELETE FROM nutrition_log_meals WHERE nutrition_log_id = $1', [log.id]);
    for (const [index, meal] of meals.entries()) {
      if (!meal?.name) continue;
      await client.query(
        `INSERT INTO nutrition_log_meals (nutrition_log_id, name, calories, protein, carbs, fat, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [log.id, meal.name, meal.calories ?? null, meal.protein ?? null, meal.carbs ?? null, meal.fat ?? null, index]
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
