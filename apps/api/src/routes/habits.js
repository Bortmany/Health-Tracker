import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import * as validate from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function toPublicHabit(row) {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
  };
}

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM habits WHERE user_id = $1 AND archived_at IS NULL ORDER BY sort_order, label',
    [req.userId]
  );
  res.json({ habits: rows.map(toPublicHabit) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { label, description, sortOrder } = req.body ?? {};
  // Cap the free-text fields and make sure sortOrder is a real whole number, so
  // a non-numeric or overflow value fails with a clean 400 instead of reaching
  // the INTEGER column and throwing a Postgres error (a 500).
  const cleanLabel = validate.stringLength(label, 'label', { max: 200 });
  const cleanDescription = validate.stringLength(description, 'description', { optional: true, max: 2000 });
  const cleanSortOrder = validate.nonNegativeNumber(sortOrder, 'sortOrder', {
    optional: true, integer: true, max: 100000,
  });

  const { rows } = await pool.query(
    `INSERT INTO habits (user_id, label, description, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [req.userId, cleanLabel, cleanDescription, cleanSortOrder ?? 0]
  );
  res.status(201).json({ habit: toPublicHabit(rows[0]) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  // A mis-shaped id would otherwise throw a Postgres cast error (a 500).
  if (!validate.isUuid(req.params.id)) {
    return res.status(404).json({ error: { message: 'Habit not found', code: 'NOT_FOUND' } });
  }
  const { label, description, sortOrder, archived } = req.body ?? {};
  // Validate every field before it reaches the typed columns: text stays inside
  // sane length caps, sortOrder must be a whole number, and archived must be a
  // real boolean (a string/number here would blow up the `$6::boolean` cast).
  const cleanLabel = validate.stringLength(label, 'label', { optional: true, max: 200 });
  const cleanDescription = validate.stringLength(description, 'description', { optional: true, max: 2000 });
  const cleanSortOrder = validate.nonNegativeNumber(sortOrder, 'sortOrder', {
    optional: true, integer: true, max: 100000,
  });
  const cleanArchived = validate.boolean(archived, 'archived', { optional: true });

  const { rows } = await pool.query(
    `UPDATE habits
     SET label = COALESCE($3, label),
         description = COALESCE($4, description),
         sort_order = COALESCE($5, sort_order),
         archived_at = CASE WHEN $6::boolean IS NULL THEN archived_at
                             WHEN $6::boolean THEN now()
                             ELSE NULL END
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [req.params.id, req.userId, cleanLabel, cleanDescription, cleanSortOrder, cleanArchived]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: { message: 'Habit not found', code: 'NOT_FOUND' } });
  }
  res.json({ habit: toPublicHabit(rows[0]) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) {
    return res.status(404).json({ error: { message: 'Habit not found', code: 'NOT_FOUND' } });
  }
  const { rowCount } = await pool.query('DELETE FROM habits WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.userId,
  ]);

  if (!rowCount) {
    return res.status(404).json({ error: { message: 'Habit not found', code: 'NOT_FOUND' } });
  }
  res.status(204).end();
}));

export default router;
