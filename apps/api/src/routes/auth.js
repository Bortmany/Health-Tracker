import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { isEmailEnabled, sendEmail } from '../lib/email.js';
import { signToken, verifyTokenPayload } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';
import { getSignupMode, isValidInviteCode } from '../lib/signupMode.js';
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
    isAdmin: row.is_admin === true,
    createdAt: row.created_at,
  };
}

// Looks up which coach a referral code belongs to, or null when the code is
// missing, malformed or unknown. Codes are random 10-character strings and
// the register route's failure throttle limits guessing, so a plain lookup
// is enough here.
async function findReferringCoach(referralCode) {
  if (typeof referralCode !== 'string') return null;
  const code = referralCode.trim().toUpperCase();
  if (code === '' || code.length > 100) return null;
  const { rows } = await pool.query(
    `SELECT p.user_id FROM coach_profiles p
     JOIN users u ON u.id = p.user_id AND u.role = 'coach'
     WHERE p.referral_code = $1`,
    [code]
  );
  return rows[0] ? { userId: rows[0].user_id } : null;
}

// Public: tells the sign-up screen whether anyone can join ("open"), a signup
// invite code is needed ("invite"), or sign-up is switched off ("closed").
// Never returns the codes themselves. (Unrelated to coach invite codes.)
router.get('/signup-mode', (_req, res) => {
  res.json({ mode: getSignupMode() });
});

router.post('/register', asyncHandler(async (req, res) => {
  // Note: `role` is deliberately NOT read from the request. New accounts are
  // always regular ('consumer') accounts — see below.
  const { email, password, displayName, inviteCode, referralCode } = req.body ?? {};

  // Signup gate (see lib/signupMode.js). Checked before anything else so a
  // closed or invite-only app does no work — and leaks nothing — for
  // strangers. The 403 here is what the register failure throttle in app.js
  // counts, so guessing codes is rate-limited per IP.
  const signupMode = getSignupMode();
  if (signupMode === 'closed') {
    return res.status(403).json({
      error: { message: 'Sign-up is closed for now.', code: 'SIGNUPS_CLOSED' },
    });
  }
  // A coach's referral link carries their referral code. In invite-only mode
  // it stands in for a signup invite code; in open mode it still records
  // which coach brought this person in. Only a current coach's code counts —
  // a revoked coach's link stops working the moment their role changes.
  const referringCoach = await findReferringCoach(referralCode);
  if (signupMode === 'invite' && !isValidInviteCode(inviteCode) && !referringCoach) {
    return res.status(403).json({
      error: { message: 'Sign-up is by invitation. Enter a valid invite code.', code: 'INVITE_REQUIRED' },
    });
  }

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

  // Security: every new account is a regular ('consumer') account. The route
  // never lets a client ask to be created as a 'coach' — that would let anyone
  // grant themselves coach access, which can read and edit other people's
  // data. The only way to become a coach is the "Become a coach" application
  // approved by the owner (routes/coachApplications.js + routes/admin.js).
  let user;
  try {
    user = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, display_name, role, referred_by_coach_id)
         VALUES ($1, $2, $3, 'consumer', $4::uuid)
         RETURNING id, email, display_name, plan_tier, role, created_at, token_version`,
        [normalizedEmail, passwordHash, cleanDisplayName, referringCoach?.userId ?? null]
      );
      await client.query('INSERT INTO user_settings (user_id) VALUES ($1)', [rows[0].id]);
      // Arriving through a referral link also asks that coach to take them on:
      // the coach sees it under Requests and accepts or declines.
      if (referringCoach) {
        await client.query(
          `INSERT INTO coach_clients (coach_id, client_id, status, requested_by)
           VALUES ($1, $2, 'requested', 'referral')`,
          [referringCoach.userId, rows[0].id]
        );
      }
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

  // One-time admin grant. If ADMIN_EMAIL names this account and nobody is an
  // admin yet, this account becomes the admin. The check and the update are one
  // SQL statement so two logins at the same moment cannot both be granted. It
  // grants exactly once, ever: once any admin exists, changing ADMIN_EMAIL
  // later never promotes a second account.
  const adminEmail = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (adminEmail && adminEmail === String(user.email).trim().toLowerCase()) {
    const { rowCount } = await pool.query(
      `UPDATE users SET is_admin = true
       WHERE id = $1 AND lower(email) = lower($2)
         AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin)
       RETURNING id`,
      [user.id, adminEmail]
    );
    if (rowCount > 0) user.is_admin = true;
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

// ---- Forgot / reset password ------------------------------------------------
//
// The emailed link carries a random 32-byte token. Only its SHA-256 hash is
// stored (a database leak can't be turned into working links), it works once
// and expires after one hour. The token is never logged. Asking for a link
// gives the SAME answer whether or not the address has an account, and the
// work happens after the reply is sent, so timing says nothing either.

const RESET_TOKEN_BYTES = 32;
const RESET_LINK_MINUTES = 60;

const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');

// The public address used in emailed links. In production it MUST be set: a
// localhost fallback there would email people a dead link, so the caller
// refuses to send instead (null). Development keeps the localhost fallback.
function appBaseUrl() {
  const raw = (process.env.APP_URL ?? '').trim().replace(/\/+$/, '');
  if (raw) return raw;
  return process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173';
}

// Creates a new reset link for this account (voiding any older ones) and
// emails it.
async function sendResetLink(userId, address) {
  const baseUrl = appBaseUrl();
  if (!baseUrl) {
    logger.error('APP_URL is not set in production, so the password reset email was NOT sent. Set APP_URL to the public address.');
    return;
  }
  const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('base64url');
  await withTransaction(async (client) => {
    // A new request voids every older link that hasn't been used.
    await client.query(
      'UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [userId]
    );
    await client.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3::int))`,
      [userId, sha256Hex(token), RESET_LINK_MINUTES]
    );
  });
  await sendEmail({
    to: address,
    subject: 'Reset your Cut password',
    text: [
      'Someone asked to reset the password for your Cut account.',
      '',
      `Open this link to choose a new password. It works once and expires in ${RESET_LINK_MINUTES} minutes:`,
      `${baseUrl}/reset-password?token=${token}`,
      '',
      "If that wasn't you, ignore this email. Your password has not changed.",
    ].join('\n'),
  });
}

router.post('/forgot-password', asyncHandler(async (req, res) => {
  // With email switched off nothing can be sent, so say so plainly.
  if (!isEmailEnabled()) {
    return res.status(503).json({
      error: { message: 'Password reset is coming soon — contact us.', code: 'EMAIL_DISABLED' },
    });
  }
  const address = validate.email(req.body?.email);

  // Same reply for every valid-looking address; the real work follows it.
  res.json({ ok: true });

  try {
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [address]);
    if (rows[0]) await sendResetLink(rows[0].id, address);
  } catch (err) {
    // The token is never part of what gets logged.
    logger.error('Could not process a password reset request', { error: err });
  }
}));

const LINK_INVALID = {
  error: { message: 'This link has expired or was already used. Ask for a new one.', code: 'LINK_INVALID' },
};

router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, password } = req.body ?? {};
  if (typeof token !== 'string' || token.length < 10 || token.length > 200) {
    return res.status(400).json(LINK_INVALID);
  }
  // Checked BEFORE the link is used up, so a too-short password doesn't burn it.
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({
      error: { message: 'Password must be at least 8 characters long', code: 'WEAK_PASSWORD' },
    });
  }
  if (password.length > 200) {
    return res.status(400).json({
      error: { message: 'That password is too long.', code: 'WEAK_PASSWORD' },
    });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const done = await withTransaction(async (client) => {
    // One atomic step decides who wins: the link is marked used only if it is
    // still unused and unexpired, so two clicks can't both succeed.
    const { rows } = await client.query(
      `UPDATE password_resets SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING user_id`,
      [sha256Hex(token)]
    );
    if (!rows[0]) return false;
    // Bumping token_version signs the account out everywhere.
    await client.query(
      'UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1',
      [rows[0].user_id, passwordHash]
    );
    // Any other open links for the account die with it.
    await client.query(
      'UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [rows[0].user_id]
    );
    return true;
  });

  if (!done) return res.status(400).json(LINK_INVALID);
  res.json({ ok: true });
}));

export default router;
