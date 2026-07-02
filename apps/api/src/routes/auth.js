import bcrypt from 'bcrypt';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { signToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const BCRYPT_COST = 12;
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  };
}

function cookieOptions() {
  return { ...baseCookieOptions(), maxAge: COOKIE_MAX_AGE_MS };
}

function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    planTier: row.plan_tier ?? 'free',
    role: row.role ?? 'consumer',
    createdAt: row.created_at,
  };
}

router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, displayName, role } = req.body ?? {};
  if (!email || !password || !displayName) {
    return res.status(400).json({
      error: { message: 'email, password, and displayName are required', code: 'INVALID_INPUT' },
    });
  }
  if (password.length < 8) {
    return res.status(400).json({
      error: { message: 'Password must be at least 8 characters long', code: 'WEAK_PASSWORD' },
    });
  }
  if (role !== undefined && role !== 'consumer' && role !== 'coach') {
    return res.status(400).json({
      error: { message: "role must be 'consumer' or 'coach'", code: 'INVALID_INPUT' },
    });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, plan_tier, role, created_at`,
      [email.toLowerCase(), passwordHash, displayName, role ?? 'consumer']
    );
    const user = rows[0];
    await client.query('INSERT INTO user_settings (user_id) VALUES ($1)', [user.id]);
    await client.query('COMMIT');

    const token = signToken(user.id);
    res.cookie('token', token, cookieOptions());
    res.status(201).json({ user: toPublicUser(user) });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(400).json({ error: { message: 'Email already registered', code: 'EMAIL_TAKEN' } });
    }
    throw err;
  } finally {
    client.release();
  }
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: { message: 'email and password are required', code: 'INVALID_INPUT' } });
  }

  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = rows[0];
  const valid = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!valid) {
    return res.status(401).json({ error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' } });
  }

  const token = signToken(user.id);
  res.cookie('token', token, cookieOptions());
  res.json({ user: toPublicUser(user) });
}));

router.post('/logout', (_req, res) => {
  res.clearCookie('token', baseCookieOptions());
  res.status(204).end();
});

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: { message: 'Not authenticated', code: 'NO_TOKEN' } });
  }
  res.json({ user: toPublicUser(user) });
}));

export default router;
