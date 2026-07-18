import bcrypt from 'bcrypt';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { withTransaction } from '../lib/withTransaction.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

// DELETE /api/account — permanently erase the signed-in user and everything
// they have logged. This is the "delete my data" right that privacy law
// expects for health data. The current password must be sent in the body so a
// stolen session cookie alone can't wipe an account.
//
// Every foreign key in docs/schema.sql already cascades from users, but each
// table is deleted explicitly (children before parents, inside one
// transaction) so the wipe stays complete even if a future table forgets its
// cascade rule.
//
// The coach case: a coach's own account and links are removed, but their
// clients keep every program the coach wrote — the created_by_coach_id column
// is simply cleared (matching its ON DELETE SET NULL constraint). Client data
// is never touched.
router.delete('/', asyncHandler(async (req, res) => {
  const { password } = req.body ?? {};
  if (!password) {
    return res.status(400).json({
      error: { message: 'Your current password is required to delete your account', code: 'INVALID_INPUT' },
    });
  }

  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: { message: 'Not authenticated', code: 'NO_TOKEN' } });
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({
      error: { message: 'That password is incorrect', code: 'INVALID_CREDENTIALS' },
    });
  }

  await withTransaction(async (client) => {
    // Coach/client links, in both directions: rows where this user is the
    // coach (including unredeemed invites) and rows where they are the client.
    await client.query('DELETE FROM coach_clients WHERE coach_id = $1 OR client_id = $1', [req.userId]);

    // Programs this user wrote as a coach stay with the clients who train on
    // them — only the link back to the departing coach is cleared.
    await client.query('UPDATE programs SET created_by_coach_id = NULL WHERE created_by_coach_id = $1', [req.userId]);

    // The user's own records. Nested children (program days/exercises, meals,
    // sets, habit ticks, check-ins) cascade off these parents — the same
    // cascades the app's normal delete endpoints rely on.
    await client.query('DELETE FROM user_plans WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM training_logs WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM nutrition_logs WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM daily_logs WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM programs WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM injuries WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM activities WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM habits WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM user_settings WHERE user_id = $1', [req.userId]);

    // Finally the account itself.
    await client.query('DELETE FROM users WHERE id = $1', [req.userId]);
  });

  // Same cookie options the logout route uses, so the session cookie is
  // actually removed by the browser.
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.status(204).end();
}));

export default router;
