import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { Rollback, withTransaction } from '../lib/withTransaction.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function toPublicActivity(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    defaultDurationMinutes: row.default_duration_minutes,
    icon: row.icon,
  };
}

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM activities WHERE user_id = $1 ORDER BY name', [req.userId]);
  res.json({ activities: rows.map(toPublicActivity) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, category, defaultDurationMinutes, icon } = req.body ?? {};
  if (!name) {
    return res.status(400).json({ error: { message: 'name is required', code: 'INVALID_INPUT' } });
  }

  const { rows } = await pool.query(
    `INSERT INTO activities (user_id, name, category, default_duration_minutes, icon)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [req.userId, name, category ?? null, defaultDurationMinutes ?? null, icon ?? null]
  );
  res.status(201).json({ activity: toPublicActivity(rows[0]) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { name, category, defaultDurationMinutes, icon } = req.body ?? {};

  const { rows } = await pool.query(
    `UPDATE activities
     SET name = COALESCE($3, name),
         category = COALESCE($4, category),
         default_duration_minutes = COALESCE($5, default_duration_minutes),
         icon = COALESCE($6, icon)
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [req.params.id, req.userId, name ?? null, category ?? null, defaultDurationMinutes ?? null, icon ?? null]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: { message: 'Activity not found', code: 'NOT_FOUND' } });
  }
  res.json({ activity: toPublicActivity(rows[0]) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const found = await withTransaction(async (client) => {
    const { rows: ownedRows } = await client.query(
      'SELECT id FROM activities WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!ownedRows[0]) throw new Rollback(false);

    // Backfill the name onto logged entries before the FK sets activity_id to
    // NULL on delete, so history doesn't end up with neither field set.
    await client.query(
      `UPDATE daily_log_activities dla
       SET name = a.name
       FROM activities a
       WHERE dla.activity_id = a.id AND a.id = $1 AND dla.name IS NULL`,
      [req.params.id]
    );

    await client.query('DELETE FROM activities WHERE id = $1', [req.params.id]);
    return true;
  });

  if (!found) {
    return res.status(404).json({ error: { message: 'Activity not found', code: 'NOT_FOUND' } });
  }
  res.status(204).end();
}));

export default router;
