import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function toPublicInjury(row) {
  return {
    id: row.id,
    region: row.region,
    note: row.note,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  };
}

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM injuries WHERE user_id = $1 ORDER BY archived_at IS NOT NULL, created_at DESC',
    [req.userId]
  );
  res.json({ injuries: rows.map(toPublicInjury) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { region, note } = req.body ?? {};
  if (!region) {
    return res.status(400).json({ error: { message: 'region is required', code: 'INVALID_INPUT' } });
  }

  const { rows } = await pool.query(
    `INSERT INTO injuries (user_id, region, note)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [req.userId, region, note ?? null]
  );
  res.status(201).json({ injury: toPublicInjury(rows[0]) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { region, note, archived } = req.body ?? {};

  const { rows } = await pool.query(
    `UPDATE injuries
     SET region = COALESCE($3, region),
         note = COALESCE($4, note),
         archived_at = CASE WHEN $5::boolean IS NULL THEN archived_at
                             WHEN $5::boolean THEN now()
                             ELSE NULL END
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [req.params.id, req.userId, region ?? null, note ?? null, archived ?? null]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: { message: 'Injury not found', code: 'NOT_FOUND' } });
  }
  res.json({ injury: toPublicInjury(rows[0]) });
}));

export default router;
