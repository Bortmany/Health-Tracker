import { verifyToken } from '../lib/jwt.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: { message: 'Not authenticated', code: 'NO_TOKEN' } });
  }

  try {
    req.userId = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: { message: 'Invalid or expired session', code: 'INVALID_TOKEN' } });
  }
}
