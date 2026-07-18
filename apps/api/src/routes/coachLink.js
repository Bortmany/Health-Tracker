import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { Rollback, withTransaction } from '../lib/withTransaction.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.post('/redeem', asyncHandler(async (req, res) => {
  const { code } = req.body ?? {};
  if (!code) {
    return res.status(400).json({ error: { message: 'code is required', code: 'INVALID_INPUT' } });
  }

  // Everything runs in one transaction with the invite row locked, so two
  // people redeeming at once (or one person redeeming two codes at once)
  // can't slip past the checks. When a check fails, the response is sent and
  // Rollback aborts the transaction, leaving `coach` empty.
  const coach = await withTransaction(async (client) => {
    const { rows: inviteRows } = await client.query(
      `SELECT * FROM coach_clients WHERE invite_code = $1 AND status = 'pending' FOR UPDATE`,
      [code]
    );
    const invite = inviteRows[0];
    if (!invite) {
      res.status(404).json({
        error: { message: 'That invite code was not found or has already been used', code: 'NOT_FOUND' },
      });
      throw new Rollback();
    }

    if (invite.coach_id === req.userId) {
      res.status(400).json({
        error: { message: "You can't use your own invite code", code: 'INVALID_INPUT' },
      });
      throw new Rollback();
    }

    const { rows: existingRows } = await client.query(
      `SELECT coach_id FROM coach_clients WHERE client_id = $1 AND status = 'active' FOR UPDATE`,
      [req.userId]
    );
    const existing = existingRows[0];
    if (existing) {
      if (existing.coach_id === invite.coach_id) {
        res.status(400).json({
          error: { message: "You're already connected to this coach", code: 'ALREADY_CONNECTED' },
        });
      } else {
        res.status(400).json({
          error: { message: 'You already have a coach. Remove them first under More.', code: 'HAS_COACH' },
        });
      }
      throw new Rollback();
    }

    const { rows, rowCount } = await client.query(
      `UPDATE coach_clients SET client_id = $1, status = 'active'
       WHERE id = $2 AND status = 'pending'
       RETURNING coach_id`,
      [req.userId, invite.id]
    );
    if (rowCount === 0) {
      res.status(404).json({
        error: { message: 'That invite code was not found or has already been used', code: 'NOT_FOUND' },
      });
      throw new Rollback();
    }

    const { rows: coachRows } = await client.query('SELECT display_name FROM users WHERE id = $1', [
      rows[0].coach_id,
    ]);
    return { displayName: coachRows[0]?.display_name ?? null };
  });

  if (!coach) return;
  res.json({ coach });
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
