import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import * as validate from '../lib/validate.js';
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
  // Cap the free-text fields so a runaway request can't stuff an unbounded
  // string into the database; an empty region still fails with a clean 400.
  const cleanRegion = validate.stringLength(region, 'region', { max: 100 });
  const cleanNote = validate.stringLength(note, 'note', { optional: true, max: 2000 });

  const { rows } = await pool.query(
    `INSERT INTO injuries (user_id, region, note)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [req.userId, cleanRegion, cleanNote]
  );
  res.status(201).json({ injury: toPublicInjury(rows[0]) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  // A mis-shaped id would otherwise throw a Postgres cast error (a 500).
  if (!validate.isUuid(req.params.id)) {
    return res.status(404).json({ error: { message: 'Injury not found', code: 'NOT_FOUND' } });
  }
  const { region, note, archived } = req.body ?? {};
  // Cap the free-text fields and require a real boolean for archived (a string
  // or number here would blow up the `$5::boolean` cast into a 500).
  const cleanRegion = validate.stringLength(region, 'region', { optional: true, max: 100 });
  const cleanNote = validate.stringLength(note, 'note', { optional: true, max: 2000 });
  const cleanArchived = validate.boolean(archived, 'archived', { optional: true });

  const { rows } = await pool.query(
    `UPDATE injuries
     SET region = COALESCE($3, region),
         note = COALESCE($4, note),
         archived_at = CASE WHEN $5::boolean IS NULL THEN archived_at
                             WHEN $5::boolean THEN now()
                             ELSE NULL END
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [req.params.id, req.userId, cleanRegion, cleanNote, cleanArchived]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: { message: 'Injury not found', code: 'NOT_FOUND' } });
  }
  res.json({ injury: toPublicInjury(rows[0]) });
}));

export default router;
