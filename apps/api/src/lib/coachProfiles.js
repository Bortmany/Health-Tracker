import crypto from 'node:crypto';

// Shared pieces of a coach's profile: the fixed specialty list, how slugs and
// referral codes are made, the SQL that joins a profile to its owner and their
// approved application, and the mapper that shapes a public profile.
//
// The public shape NEVER includes the coach's email or user id — the slug is
// the only identifier the outside world sees.

// Stored as short codes; the app shows them in plain words. Must match the
// CHECK constraint on coach_profiles.specialties (migration 020).
export const SPECIALTIES = [
  'fat-loss',
  'muscle-gain',
  'beginners',
  'strength',
  'running',
  'injury-safe',
  'nutrition',
  'womens-training',
  'over-40',
  'online-only',
];

// No 0/O or 1/I, so a code read aloud or typed from a screenshot can't be misread.
const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERRAL_CODE_LENGTH = 10;
const SLUG_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_MAX_BASE_LENGTH = 40;

function randomString(alphabet, length) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[crypto.randomInt(alphabet.length)];
  }
  return out;
}

// "Jane T. O'Neil" → "jane-t-o-neil-x7k2". Lower-case letters, digits and
// hyphens only, at most 40 characters of name, plus a 4-character random tail
// so two coaches with the same name never fight over one address.
export function makeSlug(displayName) {
  const base = String(displayName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_BASE_LENGTH)
    .replace(/-+$/g, '');
  return `${base || 'coach'}-${randomString(SLUG_SUFFIX_ALPHABET, 4)}`;
}

export function generateReferralCode() {
  return randomString(REFERRAL_ALPHABET, REFERRAL_CODE_LENGTH);
}

// The app's own public address (APP_URL, set on Railway) with any trailing
// slash removed, or '' when it isn't set or isn't a usable web address — the
// same rule billing.js applies. With no APP_URL the referral link is a path.
export function appBaseUrl(env = process.env) {
  const raw = (env.APP_URL ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return raw.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function referralLink(slug, referralCode, env = process.env) {
  return `${appBaseUrl(env)}/coach/${slug}?ref=${referralCode}`;
}

// FROM/JOIN block shared by every profile read. `u.role = 'coach'` is part of
// the join, so a revoked coach's profile row disappears from every listing the
// moment their role changes. Credentials, years and the external link are read
// from the latest approved application — never copied into the profile.
export const COACH_PROFILE_FROM = `
  FROM coach_profiles p
  JOIN users u ON u.id = p.user_id AND u.role = 'coach'
  LEFT JOIN LATERAL (
    SELECT a.credentials, a.years_coaching, a.link
    FROM coach_applications a
    WHERE a.user_id = p.user_id AND a.status = 'approved'
    ORDER BY a.decided_at DESC NULLS LAST, a.created_at DESC
    LIMIT 1
  ) a ON true`;

export const COACH_PROFILE_COLUMNS = `
  p.user_id, p.slug, p.headline, p.bio, p.specialties, p.accepting_clients, p.is_public,
  p.referral_code, p.created_at, p.updated_at,
  u.display_name, a.credentials, a.years_coaching, a.link`;

// What the world may see. No email, no id, no referral code.
export function toPublicCoach(row) {
  return {
    slug: row.slug,
    displayName: row.display_name,
    headline: row.headline,
    specialties: row.specialties ?? [],
    acceptingClients: row.accepting_clients === true,
    credentials: row.credentials ?? null,
    yearsCoaching: row.years_coaching ?? null,
    link: row.link ?? null,
  };
}

// Creates the coach's profile row if they don't have one yet. Runs inside the
// caller's transaction (it uses a savepoint), so it fits into the approve
// route without changing what approve does. A random slug or referral code
// colliding with an existing one is vanishingly rare; if it happens, one
// retry with fresh values covers it.
export async function ensureCoachProfile(client, userId, displayName) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await client.query('SAVEPOINT coach_profile');
    try {
      await client.query(
        `INSERT INTO coach_profiles (user_id, slug, referral_code)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, makeSlug(displayName), generateReferralCode()]
      );
      await client.query('RELEASE SAVEPOINT coach_profile');
      return;
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT coach_profile');
      if (err.code !== '23505' || attempt === 1) throw err;
    }
  }
}
