import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const requireCoach = asyncHandler(async (req, res, next) => {
  const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [req.userId]);
  const user = rows[0];
  if (!user || user.role !== 'coach') {
    return res.status(403).json({
      error: { message: 'This action is only available to coach accounts', code: 'COACH_ONLY' },
    });
  }
  next();
});
