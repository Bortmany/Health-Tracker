import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.post('/redeem', asyncHandler(async (req, res) => {
  const { code } = req.body ?? {};
  if (!code) {
    return res.status(400).json({ error: { message: 'code is required', code: 'INVALID_INPUT' } });
  }

  const { rows: inviteRows } = await pool.query(
    `SELECT * FROM coach_clients WHERE invite_code = $1 AND status = 'pending'`,
    [code]
  );
  const invite = inviteRows[0];
  if (!invite) {
    return res.status(404).json({
      error: { message: 'That invite code was not found or has already been used', code: 'NOT_FOUND' },
    });
  }

  if (invite.coach_id === req.userId) {
    return res.status(400).json({
      error: { message: "You can't use your own invite code", code: 'INVALID_INPUT' },
    });
  }

  const { rows: existingRows } = await pool.query(
    `SELECT coach_id FROM coach_clients WHERE client_id = $1 AND status = 'active'`,
    [req.userId]
  );
  const existing = existingRows[0];
  if (existing) {
    if (existing.coach_id === invite.coach_id) {
      return res.status(400).json({
        error: { message: "You're already connected to this coach", code: 'ALREADY_CONNECTED' },
      });
    }
    return res.status(400).json({
      error: { message: 'You already have a coach. Remove them first under More.', code: 'HAS_COACH' },
    });
  }

  const { rows } = await pool.query(
    `UPDATE coach_clients SET client_id = $1, status = 'active' WHERE id = $2 RETURNING coach_id`,
    [req.userId, invite.id]
  );
  const { rows: coachRows } = await pool.query('SELECT display_name FROM users WHERE id = $1', [
    rows[0].coach_id,
  ]);

  res.json({ coach: { displayName: coachRows[0]?.display_name ?? null } });
}));

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.display_name FROM coach_clients cc
     JOIN users u ON u.id = cc.coach_id
     WHERE cc.client_id = $1 AND cc.status = 'active'
     LIMIT 1`,
    [req.userId]
  );
  res.json({ coach: rows[0] ? { displayName: rows[0].display_name } : null });
}));

router.delete('/', asyncHandler(async (req, res) => {
  await pool.query(`DELETE FROM coach_clients WHERE client_id = $1 AND status = 'active'`, [req.userId]);
  res.status(204).end();
}));

export default router;
