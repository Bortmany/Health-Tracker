import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  COACH_PROFILE_COLUMNS,
  COACH_PROFILE_FROM,
  SPECIALTIES,
  toPublicCoach,
} from '../lib/coachProfiles.js';
import * as validate from '../lib/validate.js';

// The public coach directory. No sign-in needed: these are marketing pages.
// Only profiles the coach has switched to public are listed, only while the
// account is still a coach, and nothing here ever includes an email or user
// id. The referral lookup is the one exception to "public only": a coach may
// share their link before making their profile public.

const router = Router();

// Same answer for every visitor, so browsers and the host's edge may keep it
// for five minutes. Nothing per-user is ever served from here.
const CACHE_CONTROL = 'public, max-age=300';

function notFound(res) {
  return res.status(404).json({ error: { message: 'Coach not found', code: 'NOT_FOUND' } });
}

// A slug or code from the URL: plain text, short. Anything else is "not
// found" rather than a database error.
function isPlainKey(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 100;
}

router.get('/', asyncHandler(async (req, res) => {
  const specialty = validate.oneOf(req.query.specialty, SPECIALTIES, 'specialty', { optional: true });
  const { rows } = await pool.query(
    `SELECT ${COACH_PROFILE_COLUMNS}
     ${COACH_PROFILE_FROM}
     WHERE p.is_public = true
       AND ($1::text IS NULL OR $1::text = ANY(p.specialties))
     ORDER BY u.display_name`,
    [specialty]
  );
  res.set('Cache-Control', CACHE_CONTROL);
  res.json({ coaches: rows.map(toPublicCoach) });
}));

// Who a referral link belongs to — shown on the sign-up screen as "Invited by
// Coach [Name]". Registered before /:slug so "referral" is never read as a slug.
router.get('/referral/:code', asyncHandler(async (req, res) => {
  if (!isPlainKey(req.params.code)) return notFound(res);
  const { rows } = await pool.query(
    `SELECT p.slug, u.display_name
     FROM coach_profiles p
     JOIN users u ON u.id = p.user_id AND u.role = 'coach'
     WHERE p.referral_code = $1`,
    [req.params.code.trim().toUpperCase()]
  );
  if (!rows[0]) return notFound(res);
  res.json({ coach: { slug: rows[0].slug, displayName: rows[0].display_name } });
}));

router.get('/:slug', asyncHandler(async (req, res) => {
  if (!isPlainKey(req.params.slug)) return notFound(res);
  const { rows } = await pool.query(
    `SELECT ${COACH_PROFILE_COLUMNS}
     ${COACH_PROFILE_FROM}
     WHERE p.slug = $1 AND p.is_public = true`,
    [req.params.slug]
  );
  if (!rows[0]) return notFound(res);
  res.set('Cache-Control', CACHE_CONTROL);
  // The referral code is part of the public page on purpose: it is what turns
  // "Train with [Name]" into a sign-up link for visitors who have no invite
  // code. Coaches share it publicly anyway, and it grants nothing but a
  // pending request to this coach. The directory list still leaves it out.
  res.json({ coach: { ...toPublicCoach(rows[0]), bio: rows[0].bio, referralCode: rows[0].referral_code } });
}));

export default router;
