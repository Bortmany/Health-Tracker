import bcrypt from 'bcrypt';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { signToken, verifyTokenPayload } from '../lib/jwt.js';
import * as validate from '../lib/validate.js';
import { withTransaction } from '../lib/withTransaction.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const BCRYPT_COST = 12;
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// A fixed throwaway hash used only so a login for an unknown email spends the
// same time as one for a real account. Without this, only real emails trigger a
// (slow) bcrypt check, and the faster response for unknown emails would reveal
// which addresses have accounts (account enumeration).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('cut-login-timing-equalizer', BCRYPT_COST);

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
  // Note: `role` is deliberately NOT read from the request. New accounts are
  // always regular ('consumer') accounts — see below.
  const { email, password, displayName } = req.body ?? {};
  if (!email || !password || !displayName) {
    return res.status(400).json({
      error: { message: 'email, password, and displayName are required', code: 'INVALID_INPUT' },
    });
  }
  // Reject malformed addresses up front (returns it trimmed + lower-cased).
  const normalizedEmail = validate.email(email);
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({
      error: { message: 'Password must be at least 8 characters long', code: 'WEAK_PASSWORD' },
    });
  }
  const cleanDisplayName = validate.stringLength(displayName, 'displayName', { max: 100 });

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  // Security: every new account is a regular ('consumer') account. The route no
  // longer lets a client ask to be created as a 'coach' — that let anyone grant
  // themselves coach access, which can read and edit other people's data.
  // TODO(coach onboarding): add a verified promotion path (e.g. an admin action
  // or redeeming a coach invite) so genuine coaches can be created safely.
  let user;
  try {
    user = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, display_name, role)
         VALUES ($1, $2, $3, 'consumer')
         RETURNING id, email, display_name, plan_tier, role, created_at, token_version`,
        [normalizedEmail, passwordHash, cleanDisplayName]
      );
      await client.query('INSERT INTO user_settings (user_id) VALUES ($1)', [rows[0].id]);
      return rows[0];
    });
  } catch (err) {
    if (err.code === '23505') {
      // Don't confirm whether an address already has an account — that lets an
      // attacker discover who is registered. Return a generic error instead.
      return res.status(400).json({
        error: {
          message: "We couldn't create your account. Please check your details and try again.",
          code: 'REGISTRATION_FAILED',
        },
      });
    }
    throw err;
  }

  const token = signToken(user.id, user.token_version ?? 0);
  res.cookie('token', token, cookieOptions());
  res.status(201).json({ user: toPublicUser(user) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: { message: 'email and password are required', code: 'INVALID_INPUT' } });
  }

  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()]);
  const user = rows[0];
  // Always run a bcrypt comparison — against a throwaway hash when no account
  // matches — so an unknown email takes the same time as a real one. This keeps
  // response timing from revealing which addresses are registered.
  const valid = await bcrypt.compare(String(password), user ? user.password_hash : DUMMY_PASSWORD_HASH);

  if (!user || !valid) {
    return res.status(401).json({ error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' } });
  }

  const token = signToken(user.id, user.token_version ?? 0);
  res.cookie('token', token, cookieOptions());
  res.json({ user: toPublicUser(user) });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  // Server-side revocation: bump this account's token version so the cookie
  // we're clearing (and any other copy of it that was captured) stops working
  // immediately, instead of staying valid until its 7-day clock runs out.
  const token = req.cookies?.token;
  if (token) {
    try {
      const { sub } = verifyTokenPayload(token);
      await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [sub]);
    } catch {
      // A missing or already-invalid token has nothing to revoke.
    }
  }
  res.clearCookie('token', baseCookieOptions());
  res.status(204).end();
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: { message: 'Not authenticated', code: 'NO_TOKEN' } });
  }
  res.json({ user: toPublicUser(user) });
}));

export default router;
