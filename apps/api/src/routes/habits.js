import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
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
  if (!label) {
    return res.status(400).json({ error: { message: 'label is required', code: 'INVALID_INPUT' } });
  }

  const { rows } = await pool.query(
    `INSERT INTO habits (user_id, label, description, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [req.userId, label, description ?? null, sortOrder ?? 0]
  );
  res.status(201).json({ habit: toPublicHabit(rows[0]) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { label, description, sortOrder, archived } = req.body ?? {};

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
    [req.params.id, req.userId, label ?? null, description ?? null, sortOrder ?? null, archived ?? null]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: { message: 'Habit not found', code: 'NOT_FOUND' } });
  }
  res.json({ habit: toPublicHabit(rows[0]) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
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
