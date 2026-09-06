import crypto from 'crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  COACH_PROFILE_COLUMNS,
  COACH_PROFILE_FROM,
  SPECIALTIES,
  ensureCoachProfile,
  referralLink,
} from '../lib/coachProfiles.js';
import * as validate from '../lib/validate.js';
import { Rollback, withTransaction } from '../lib/withTransaction.js';
import { requireAuth } from '../middleware/auth.js';
import { requireCoach } from '../middleware/requireCoach.js';
import { fetchNestedDays, replaceDays } from './programs.js';

const router = Router();

function toPublicProgram(row, days) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    fromCoach: row.created_by_coach_id != null,
    days,
  };
}

// A malformed id in the URL would otherwise reach Postgres as an invalid UUID
// and throw a 500 — this turns it into a clean "not found".
function clientNotFound(res) {
  return res.status(404).json({ error: { message: 'Client not found', code: 'NOT_FOUND' } });
}

function generateInviteCode() {
  return crypto.randomBytes(8).toString('base64url').slice(0, 10);
}

function linkNotFound(res) {
  return res.status(404).json({ error: { message: 'Client link not found', code: 'NOT_FOUND' } });
}

function requestNotFound(res) {
  return res.status(404).json({ error: { message: 'Request not found', code: 'NOT_FOUND' } });
}

// A profile can only be public once it says enough to be worth finding.
const MIN_PUBLIC_BIO_LENGTH = 80;

// The coach's own view of their profile: everything the public sees plus the
// private switches and the referral link.
function toOwnProfile(row) {
  return {
    slug: row.slug,
    headline: row.headline,
    bio: row.bio,
    specialties: row.specialties ?? [],
    acceptingClients: row.accepting_clients === true,
    isPublic: row.is_public === true,
    referralCode: row.referral_code,
    referralLink: referralLink(row.slug, row.referral_code),
    credentials: row.credentials ?? null,
    yearsCoaching: row.years_coaching ?? null,
    link: row.link ?? null,
  };
}

async function fetchOwnProfile(userId) {
  const { rows } = await pool.query(
    `SELECT ${COACH_PROFILE_COLUMNS} ${COACH_PROFILE_FROM} WHERE p.user_id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}

// Every approved coach gets a profile at approval time (and the migration
// backfilled earlier coaches), but a coach promoted any other way would have
// none — create it on first read so nobody is stranded.
async function loadOrCreateOwnProfile(userId) {
  const existing = await fetchOwnProfile(userId);
  if (existing) return existing;
  const { rows } = await pool.query('SELECT display_name FROM users WHERE id = $1', [userId]);
  await withTransaction((client) => ensureCoachProfile(client, userId, rows[0]?.display_name));
  return fetchOwnProfile(userId);
}

// Specialties must be a list of known codes (no free text), with no repeats.
function validateSpecialties(value) {
  if (!Array.isArray(value)) {
    throw new validate.ValidationError('specialties must be a list');
  }
  const clean = [];
  for (const item of value) {
    validate.oneOf(item, SPECIALTIES, 'specialties');
    if (!clean.includes(item)) clean.push(item);
  }
  return clean;
}

// Names what a public profile still needs, in plain words, or '' when complete.
function publicProfileGap({ headline, bio, specialties }) {
  const missing = [];
  if (!headline) missing.push('a headline');
  if (!bio || bio.length < MIN_PUBLIC_BIO_LENGTH) missing.push(`a bio of at least ${MIN_PUBLIC_BIO_LENGTH} characters`);
  if (!specialties || specialties.length === 0) missing.push('at least one specialty');
  if (missing.length === 0) return '';
  const list = missing.length === 1
    ? missing[0]
    : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
  return `Add ${list} before making your profile public.`;
}

async function findActiveLink(coachId, clientId) {
  const { rows } = await pool.query(
    `SELECT * FROM coach_clients WHERE coach_id = $1 AND client_id = $2 AND status = 'active'`,
    [coachId, clientId]
  );
  return rows[0] ?? null;
}

router.use(requireAuth, requireCoach);

router.get('/profile', asyncHandler(async (req, res) => {
  const profile = await loadOrCreateOwnProfile(req.userId);
  res.json({ profile: toOwnProfile(profile) });
}));

router.put('/profile', asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  // Only the fields sent are changed; anything left out keeps its value.
  const headline = 'headline' in body
    ? validate.stringLength(body.headline, 'headline', { max: 80, optional: true })
    : undefined;
  const bio = 'bio' in body
    ? validate.stringLength(body.bio, 'bio', { max: 1000, optional: true })
    : undefined;
  const specialties = 'specialties' in body ? validateSpecialties(body.specialties) : undefined;
  const acceptingClients = validate.boolean(body.acceptingClients, 'acceptingClients', { optional: true });
  const isPublic = validate.boolean(body.isPublic, 'isPublic', { optional: true });

  const current = await loadOrCreateOwnProfile(req.userId);
  const next = {
    headline: headline === undefined ? current.headline : headline,
    bio: bio === undefined ? current.bio : bio,
    specialties: specialties === undefined ? (current.specialties ?? []) : specialties,
    acceptingClients: acceptingClients ?? current.accepting_clients === true,
    isPublic: isPublic ?? current.is_public === true,
  };

  // The public rule is enforced here, server-side, so it can't be skipped by
  // editing the request in the browser.
  if (next.isPublic) {
    const gap = publicProfileGap(next);
    if (gap) {
      return res.status(400).json({ error: { message: gap, code: 'PROFILE_INCOMPLETE' } });
    }
  }

  await pool.query(
    `UPDATE coach_profiles
     SET headline = $2, bio = $3, specialties = $4::text[], accepting_clients = $5::boolean,
         is_public = $6::boolean, updated_at = now()
     WHERE user_id = $1`,
    [req.userId, next.headline, next.bio, next.specialties, next.acceptingClients, next.isPublic]
  );
  res.json({ profile: toOwnProfile(await fetchOwnProfile(req.userId)) });
}));

// Students who asked to work with this coach (from the directory or by
// signing up through the referral link) and are waiting on an answer.
router.get('/requests', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cc.id, cc.client_id, cc.requested_by, cc.created_at, u.display_name
     FROM coach_clients cc
     JOIN users u ON u.id = cc.client_id
     WHERE cc.coach_id = $1 AND cc.status = 'requested' AND cc.requested_by IN ('client', 'referral')
     ORDER BY cc.created_at DESC`,
    [req.userId]
  );
  res.json({
    requests: rows.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      displayName: row.display_name,
      requestedBy: row.requested_by,
      createdAt: row.created_at,
    })),
  });
}));

router.post('/requests/:id/accept', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return requestNotFound(res);

  // The request row is locked for the whole check, so two accepts (or an
  // accept racing another coach's accept for the same student) can't both win.
  let accepted;
  try {
    accepted = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, client_id FROM coach_clients
         WHERE id = $1 AND coach_id = $2 AND status = 'requested' AND requested_by IN ('client', 'referral')
         FOR UPDATE`,
        [req.params.id, req.userId]
      );
      const request = rows[0];
      if (!request) {
        requestNotFound(res);
        throw new Rollback();
      }
      const { rows: activeRows } = await client.query(
        `SELECT 1 FROM coach_clients WHERE client_id = $1 AND status = 'active'`,
        [request.client_id]
      );
      if (activeRows[0]) {
        res.status(409).json({
          error: { message: 'This person already has a coach, so the request can no longer be accepted.', code: 'CLIENT_HAS_COACH' },
        });
        throw new Rollback();
      }
      await client.query(`UPDATE coach_clients SET status = 'active' WHERE id = $1`, [request.id]);
      return true;
    });
  } catch (err) {
    // The one-active-coach index caught a race the lock couldn't see.
    if (err.code === '23505') {
      return res.status(409).json({
        error: { message: 'This person already has a coach, so the request can no longer be accepted.', code: 'CLIENT_HAS_COACH' },
      });
    }
    throw err;
  }
  if (!accepted) return;
  res.json({ ok: true });
}));

router.post('/requests/:id/decline', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return requestNotFound(res);
  const { rowCount } = await pool.query(
    `UPDATE coach_clients SET status = 'declined'
     WHERE id = $1 AND coach_id = $2 AND status = 'requested' AND requested_by IN ('client', 'referral')`,
    [req.params.id, req.userId]
  );
  if (!rowCount) return requestNotFound(res);
  res.json({ ok: true });
}));

// Invite someone by email. The reply is the same whether or not the address
// has a Cut account, and the database work is one statement either way, so
// nothing about the response reveals who is registered. A pending invite is
// created only when the address belongs to someone else with no live link to
// this coach already.
router.post('/invites/email', asyncHandler(async (req, res) => {
  const email = validate.email(req.body?.email);
  try {
    await pool.query(
      `INSERT INTO coach_clients (coach_id, client_id, status, requested_by, invite_email)
       SELECT $1, u.id, 'requested', 'coach', $2
       FROM users u
       WHERE u.email = $2 AND u.id <> $1
         AND NOT EXISTS (
           SELECT 1 FROM coach_clients cc
           WHERE cc.coach_id = $1 AND cc.client_id = u.id AND cc.status IN ('requested', 'active', 'pending')
         )`,
      [req.userId, email]
    );
  } catch (err) {
    // Two invites to the same person at the same moment: the first one stands.
    if (err.code !== '23505') throw err;
  }
  res.status(202).json({ message: "If that address has a Cut account, they'll see your invite." });
}));

router.get('/clients', asyncHandler(async (req, res) => {
  const { rows: activeRows } = await pool.query(
    `SELECT cc.id AS link_id, cc.client_id, u.display_name, u.email
     FROM coach_clients cc
     JOIN users u ON u.id = cc.client_id
     WHERE cc.coach_id = $1 AND cc.status = 'active'
     ORDER BY u.display_name`,
    [req.userId]
  );
  const { rows: pendingRows } = await pool.query(
    `SELECT id AS link_id, invite_code, created_at
     FROM coach_clients
     WHERE coach_id = $1 AND status = 'pending'
     ORDER BY created_at DESC`,
    [req.userId]
  );

  res.json({
    clients: activeRows.map((row) => ({
      linkId: row.link_id,
      clientId: row.client_id,
      displayName: row.display_name,
      email: row.email,
    })),
    pendingInvites: pendingRows.map((row) => ({
      linkId: row.link_id,
      inviteCode: row.invite_code,
      createdAt: row.created_at,
    })),
  });
}));

router.post('/invites', asyncHandler(async (req, res) => {
  const inviteCode = generateInviteCode();
  await pool.query(
    `INSERT INTO coach_clients (coach_id, invite_code) VALUES ($1, $2)`,
    [req.userId, inviteCode]
  );
  res.status(201).json({ inviteCode });
}));

// Ending a link (or discarding an unused invite code) keeps the row, marked
// 'ended', so the history of who coached whom survives. The client's own
// logs and programs are never touched.
router.delete('/clients/:linkId', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.linkId)) return linkNotFound(res);
  const { rowCount } = await pool.query(
    `UPDATE coach_clients SET status = 'ended', ended_at = now()
     WHERE id = $1 AND coach_id = $2 AND status IN ('active', 'pending', 'requested')`,
    [req.params.linkId, req.userId]
  );
  if (!rowCount) return linkNotFound(res);
  res.status(204).end();
}));

router.get('/clients/:clientId/summary', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.clientId)) return clientNotFound(res);
  const link = await findActiveLink(req.userId, req.params.clientId);
  if (!link) {
    return clientNotFound(res);
  }

  const { rows: userRows } = await pool.query('SELECT display_name FROM users WHERE id = $1', [
    req.params.clientId,
  ]);
  const client = userRows[0];
  if (!client) {
    return res.status(404).json({ error: { message: 'Client not found', code: 'NOT_FOUND' } });
  }

  const { rows: weighInRows } = await pool.query(
    `SELECT date::text AS date, weight FROM daily_logs
     WHERE user_id = $1 AND weight IS NOT NULL AND date >= (CURRENT_DATE - INTERVAL '30 days')
     ORDER BY date`,
    [req.params.clientId]
  );

  const { rows: sessionRows } = await pool.query(
    `SELECT id, date::text AS date, notes FROM training_logs
     WHERE user_id = $1 ORDER BY date DESC LIMIT 5`,
    [req.params.clientId]
  );

  const { rows: programRows } = await pool.query(
    `SELECT id, name, created_by_coach_id FROM programs
     WHERE user_id = $1 AND archived_at IS NULL
     ORDER BY created_at DESC`,
    [req.params.clientId]
  );

  res.json({
    client: { displayName: client.display_name },
    weighIns: weighInRows.map((row) => ({ date: row.date, weight: row.weight })),
    recentSessions: sessionRows.map((row) => ({ id: row.id, date: row.date, notes: row.notes })),
    programs: programRows.map((row) => ({
      id: row.id,
      name: row.name,
      fromMe: row.created_by_coach_id === req.userId,
    })),
  });
}));

router.post('/clients/:clientId/programs', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.clientId)) return clientNotFound(res);
  const link = await findActiveLink(req.userId, req.params.clientId);
  if (!link) {
    return clientNotFound(res);
  }

  const { name, description, days = [] } = req.body ?? {};
  // Cap the free-text fields (and reject a non-string name) before they reach
  // the text columns, the same way the consumer program route does.
  const cleanName = validate.stringLength(name, 'name', { max: 200 });
  const cleanDescription = validate.stringLength(description, 'description', { optional: true, max: 2000 });

  const program = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO programs (user_id, name, description, created_by_coach_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.clientId, cleanName, cleanDescription, req.userId]
    );
    await replaceDays(client, rows[0].id, days);
    return rows[0];
  });
  res.status(201).json({ program: toPublicProgram(program, await fetchNestedDays(pool, program.id)) });
}));

router.put('/clients/:clientId/programs/:programId', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.clientId)) return clientNotFound(res);
  if (!validate.isUuid(req.params.programId)) {
    return res.status(404).json({ error: { message: 'Program not found', code: 'NOT_FOUND' } });
  }
  const link = await findActiveLink(req.userId, req.params.clientId);
  if (!link) {
    return clientNotFound(res);
  }

  const { name, description, archived, days } = req.body ?? {};
  // Cap the text fields and require a real boolean for archived — a string/number
  // here would blow up the `$4::boolean` cast into a 500 (same fix as programs.js).
  const cleanName = validate.stringLength(name, 'name', { optional: true, max: 200 });
  const cleanDescription = validate.stringLength(description, 'description', { optional: true, max: 2000 });
  const cleanArchived = validate.boolean(archived, 'archived', { optional: true });

  const program = await withTransaction(async (client) => {
    const { rows: ownedRows } = await client.query(
      `SELECT id FROM programs
       WHERE id = $1 AND user_id = $2 AND created_by_coach_id = $3`,
      [req.params.programId, req.params.clientId, req.userId]
    );
    if (!ownedRows[0]) throw new Rollback(null);

    const { rows } = await client.query(
      `UPDATE programs
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           archived_at = CASE WHEN $4::boolean IS NULL THEN archived_at
                               WHEN $4::boolean THEN now()
                               ELSE NULL END
       WHERE id = $1
       RETURNING *`,
      [req.params.programId, cleanName, cleanDescription, cleanArchived]
    );

    if (days) {
      await replaceDays(client, rows[0].id, days);
    }

    return rows[0];
  });

  if (!program) {
    return res.status(404).json({ error: { message: 'Program not found', code: 'NOT_FOUND' } });
  }
  res.json({ program: toPublicProgram(program, await fetchNestedDays(pool, program.id)) });
}));

export default router;
