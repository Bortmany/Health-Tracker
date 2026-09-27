import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';

// Gate for the owner-only admin routes. The flag is re-read from the database
// on every request (never trusted from the session), so it takes effect the
// moment it changes. Anyone who is not the admin gets a plain "not found" —
// never a 403 — so the reply gives no hint that an admin area exists.
export const requireAdmin = asyncHandler(async (req, res, next) => {
  const { rows } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
  if (!rows[0] || rows[0].is_admin !== true) {
    return res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
  }
  next();
});
