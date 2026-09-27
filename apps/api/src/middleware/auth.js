import { pool } from '../db/pool.js';
import { verifyTokenPayload } from '../lib/jwt.js';

export async function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: { message: 'Not authenticated', code: 'NO_TOKEN' } });
  }

  let payload;
  try {
    payload = verifyTokenPayload(token);
  } catch {
    return res.status(401).json({ error: { message: 'Invalid or expired session', code: 'INVALID_TOKEN' } });
  }

  // Server-side session revocation. The token carries the account's token
  // version from when it was signed; logging out (or deleting the account)
  // bumps that number on the users row. If they no longer match, this token has
  // been revoked — reject it even though its 7-day clock hasn't run out yet.
  // A deleted account has no row at all, which also correctly rejects the token.
  try {
    const { rows } = await pool.query('SELECT token_version FROM users WHERE id = $1', [payload.sub]);
    if (!rows[0] || rows[0].token_version !== (payload.tv ?? 0)) {
      return res.status(401).json({ error: { message: 'Invalid or expired session', code: 'INVALID_TOKEN' } });
    }
  } catch (err) {
    return next(err);
  }

  req.userId = payload.sub;
  next();
}
