import crypto from 'crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  CHECKIN_COLUMNS,
  MAX_CHECKIN_QUESTIONS,
  MAX_QUESTION_LENGTH,
  loadCoachQuestions,
  toPublicCheckin,
} from '../lib/checkins.js';
import {
  COACH_PROFILE_COLUMNS,
  COACH_PROFILE_FROM,
  SPECIALTIES,
  ensureCoachProfile,
  referralLink,
} from '../lib/coachProfiles.js';
import {
  addMessage,
  cleanMessageBody,
  clientsWithUnread,
  findCoachThread,
  loadMessages,
  markThreadRead,
} from '../lib/messages.js';
import { cleanDays, loadMeasurements } from '../lib/measurements.js';
import { PHOTO_COLUMNS, sendPhotoFile, toCoachPhoto } from '../lib/photos.js';
import { photosEnabled } from '../lib/photoStorage.js';
import * as validate from '../lib/validate.js';
import { daysBetween, resolveToday, weekStartOf } from '../lib/userToday.js';
import { coachReadiness } from '../lib/coachMoney.js';
import { stopSubscriptionsWhere } from '../lib/stopSubscriptions.js';
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

// The coach's weekly check-in questions (1 to 8). Every coach starts from the
// four defaults; saving replaces the whole list. Check-ins already sent keep
// the questions they were answered against.
router.get('/checkin-questions', asyncHandler(async (req, res) => {
  res.json({ questions: await loadCoachQuestions(req.userId) });
}));

router.put('/checkin-questions', asyncHandler(async (req, res) => {
  const { questions } = req.body ?? {};
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > MAX_CHECKIN_QUESTIONS) {
    throw new validate.ValidationError(
      `Add between 1 and ${MAX_CHECKIN_QUESTIONS} questions.`,
      'VALIDATION_ERROR'
    );
  }
  const clean = questions.map((q) => (typeof q === 'string' ? q.trim() : null));
  if (clean.some((q) => q === null || [...q].length < 1 || [...q].length > MAX_QUESTION_LENGTH)) {
    throw new validate.ValidationError(
      `Each question needs some text, up to ${MAX_QUESTION_LENGTH} characters.`,
      'VALIDATION_ERROR'
    );
  }

  const { rows } = await pool.query(
    `INSERT INTO checkin_templates (coach_id, questions)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (coach_id) DO UPDATE SET questions = EXCLUDED.questions, updated_at = now()
     RETURNING questions`,
    [req.userId, JSON.stringify(clean)]
  );
  res.json({ questions: rows[0].questions });
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
      // A request is a PAYING student: the coach must have paid the startup
      // fee, passed the identity check and set a price first.
      const readiness = await coachReadiness(client, req.userId);
      if (!readiness.ready) {
        res.status(409).json({
          error: {
            message: 'Finish the Get paid steps first (startup fee, identity check and your price), then you can accept.',
            code: 'COACH_NOT_READY',
          },
        });
        throw new Rollback();
      }
      // The link goes live only when the student's payment is confirmed by the
      // payment company's webhook (routes/billing.js), never from here.
      await client.query(`UPDATE coach_clients SET status = 'pending_payment' WHERE id = $1`, [request.id]);
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
           WHERE cc.coach_id = $1 AND cc.client_id = u.id AND cc.status IN ('requested', 'active', 'pending', 'pending_payment')
         )`,
      [req.userId, email]
    );
  } catch (err) {
    // Two invites to the same person at the same moment: the first one stands.
    if (err.code !== '23505') throw err;
  }
  res.status(202).json({ message: "If that address has a Cut account, they'll see your invite." });
}));

// The "who needs me today" signals for the Clients list. Everything is
// worked out from logs the client already keeps for themselves; nothing new
// is asked of them. Each signal is one query over ALL of this coach's active
// clients at once (never one query per client), then matched up in JS.
// "Today" is the coach's own day (see lib/userToday.js), and "this week" is
// the Monday–Sunday week it falls in, never the server's UTC day.
async function fetchClientSignals(coachId, clientIds, today) {
  const empty = {
    lastActive: new Map(), done: new Map(), planned: new Map(), weights: new Map(), checkedIn: new Map(),
  };
  if (clientIds.length === 0) return empty;

  // Last day the client logged anything (a daily log or a training session),
  // and how many whole days ago that was.
  const { rows: activeRows } = await pool.query(
    `SELECT user_id, MAX(date)::text AS last_active,
            GREATEST(0, $2::date - MAX(date))::integer AS quiet_days
     FROM (
       SELECT user_id, date FROM daily_logs WHERE user_id = ANY($1::uuid[])
       UNION ALL
       SELECT user_id, date FROM training_logs WHERE user_id = ANY($1::uuid[])
     ) logged
     GROUP BY user_id`,
    [clientIds, today]
  );

  // Training sessions logged this week (Monday through Sunday, today's week).
  const { rows: doneRows } = await pool.query(
    `SELECT user_id, COUNT(*)::integer AS done
     FROM training_logs
     WHERE user_id = ANY($1::uuid[])
       AND date >= $2::date
       AND date < $2::date + 7
     GROUP BY user_id`,
    [clientIds, weekStartOf(today)]
  );

  // How many training days are in the newest program THIS coach assigned to
  // each client (archived programs don't count).
  const { rows: plannedRows } = await pool.query(
    `SELECT DISTINCT ON (p.user_id) p.user_id,
            (SELECT COUNT(*) FROM program_days d WHERE d.program_id = p.id)::integer AS planned
     FROM programs p
     WHERE p.user_id = ANY($1::uuid[]) AND p.created_by_coach_id = $2 AND p.archived_at IS NULL
     ORDER BY p.user_id, p.created_at DESC`,
    [clientIds, coachId]
  );

  // Weigh-ins from the last 28 days, oldest first, for the small trend line.
  const { rows: weightRows } = await pool.query(
    `SELECT user_id, date::text AS date, weight
     FROM daily_logs
     WHERE user_id = ANY($1::uuid[]) AND weight IS NOT NULL
       AND date > $2::date - 28
     ORDER BY date`,
    [clientIds, today]
  );

  // Who has sent THIS coach a check-in for this week, and when (one query for
  // everyone).
  const { rows: checkinRows } = await pool.query(
    `SELECT user_id, submitted_at FROM checkins
     WHERE user_id = ANY($1::uuid[]) AND coach_id = $2 AND week_start = $3::date`,
    [clientIds, coachId, weekStartOf(today)]
  );

  const signals = empty;
  for (const row of checkinRows) signals.checkedIn.set(row.user_id, row.submitted_at);
  for (const row of activeRows) {
    signals.lastActive.set(row.user_id, { lastActiveAt: row.last_active, quietDays: row.quiet_days });
  }
  for (const row of doneRows) signals.done.set(row.user_id, row.done);
  for (const row of plannedRows) signals.planned.set(row.user_id, row.planned);
  for (const row of weightRows) {
    if (!signals.weights.has(row.user_id)) signals.weights.set(row.user_id, []);
    signals.weights.get(row.user_id).push({ date: row.date, weight: Number(row.weight) });
  }
  return signals;
}

// Who needs attention first: never logged, then quietest, then by name.
function compareClientsForTriage(a, b) {
  if (a.quietDays === null && b.quietDays !== null) return -1;
  if (a.quietDays !== null && b.quietDays === null) return 1;
  if (a.quietDays !== b.quietDays) return b.quietDays - a.quietDays;
  return a.displayName.localeCompare(b.displayName);
}

router.get('/clients', asyncHandler(async (req, res) => {
  // `?today=YYYY-MM-DD` is the coach's device day; without it, Oman's day.
  const today = resolveToday(req.query.today);
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

  const clientIds = activeRows.map((row) => row.client_id);
  const signals = await fetchClientSignals(req.userId, clientIds, today);
  const unreadFrom = await clientsWithUnread(req.userId, clientIds);

  const clients = activeRows.map((row) => {
    const activity = signals.lastActive.get(row.client_id) ?? { lastActiveAt: null, quietDays: null };
    return {
      linkId: row.link_id,
      clientId: row.client_id,
      displayName: row.display_name,
      email: row.email,
      lastActiveAt: activity.lastActiveAt,
      // A log dated tomorrow (a phone ahead of the server's clock) counts as
      // active today rather than as a negative number of quiet days.
      quietDays: activity.quietDays === null ? null : Math.max(0, activity.quietDays),
      adherence: {
        done: signals.done.get(row.client_id) ?? 0,
        planned: signals.planned.get(row.client_id) ?? null,
      },
      weightSeries: signals.weights.get(row.client_id) ?? [],
      checkinThisWeek: signals.checkedIn.has(row.client_id) ? 'done' : 'due',
      checkinSentAt: signals.checkedIn.get(row.client_id) ?? null,
      // Something from this client the coach hasn't opened yet.
      unreadMessages: unreadFrom.has(row.client_id),
    };
  });
  clients.sort(compareClientsForTriage);

  res.json({
    clients,
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
     WHERE id = $1 AND coach_id = $2 AND status IN ('active', 'pending', 'requested', 'pending_payment')`,
    [req.params.linkId, req.userId]
  );
  if (!rowCount) return linkNotFound(res);
  // Ending a link also stops that student's monthly payments.
  await stopSubscriptionsWhere('cc.id = $1 AND cc.coach_id = $2', [req.params.linkId, req.userId]);
  res.status(204).end();
}));

function roundTo(value, places) {
  if (value == null) return null;
  const factor = 10 ** places;
  return Math.round(Number(value) * factor) / factor;
}

// The client's week at a glance (Monday to Sunday of the coach's day), next
// to their check-in. Deliberately no calories or protein — coaches see
// training, sleep, steps, habits and weight only. `weighIns` are the last 30
// days of weigh-ins, oldest first, already loaded for the summary.
async function fetchThisWeek(clientId, weekStart, today, weighIns) {
  const { rows: sessionRows } = await pool.query(
    `SELECT COUNT(*)::integer AS sessions FROM training_logs
     WHERE user_id = $1 AND date >= $2::date AND date < $2::date + 7`,
    [clientId, weekStart]
  );
  const { rows: dailyRows } = await pool.query(
    `SELECT AVG(sleep) AS avg_sleep, AVG(steps) AS avg_steps FROM daily_logs
     WHERE user_id = $1 AND date >= $2::date AND date < $2::date + 7`,
    [clientId, weekStart]
  );
  // Habits: "x of y" — ticks on the client's current (not archived) habits
  // from Monday up to today, out of (current habits x days so far this week).
  const { rows: habitRows } = await pool.query(
    `SELECT COUNT(*)::integer AS ticked
     FROM daily_log_habits dlh
     JOIN daily_logs dl ON dl.id = dlh.daily_log_id
     JOIN habits h ON h.id = dlh.habit_id
     WHERE dl.user_id = $1 AND h.user_id = $1 AND h.archived_at IS NULL
       AND dlh.completed = true
       AND dl.date >= $2::date AND dl.date <= $3::date`,
    [clientId, weekStart, today]
  );
  const { rows: habitCountRows } = await pool.query(
    `SELECT COUNT(*)::integer AS habits FROM habits
     WHERE user_id = $1 AND archived_at IS NULL`,
    [clientId]
  );
  const daysSoFar = Math.min(7, Math.max(1, daysBetween(weekStart, today) + 1));
  const { rows: lastRows } = await pool.query(
    `SELECT MAX(date)::text AS last_logged_on FROM (
       SELECT date FROM daily_logs WHERE user_id = $1
       UNION ALL
       SELECT date FROM training_logs WHERE user_id = $1
     ) logged`,
    [clientId]
  );
  const { rows: latestWeightRows } = await pool.query(
    `SELECT weight FROM daily_logs
     WHERE user_id = $1 AND weight IS NOT NULL
     ORDER BY date DESC LIMIT 1`,
    [clientId]
  );

  const weightChange = weighIns.length >= 2
    ? roundTo(Number(weighIns[weighIns.length - 1].weight) - Number(weighIns[0].weight), 1)
    : null;

  return {
    weekStart,
    sessions: sessionRows[0].sessions,
    avgSleep: roundTo(dailyRows[0].avg_sleep, 1),
    avgSteps: roundTo(dailyRows[0].avg_steps, 0),
    habitsTicked: habitRows[0].ticked,
    habitsPossible: habitCountRows[0].habits * daysSoFar,
    lastLoggedOn: lastRows[0].last_logged_on ?? null,
    latestWeight: latestWeightRows[0] ? Number(latestWeightRows[0].weight) : null,
    weightChange,
  };
}

// The check-ins this client sent to THIS coach, newest week first. Only while
// the link is active: once it ends, every check-in is out of reach (a plain
// "not found"). Check-ins the client sent to another coach never show.
router.get('/clients/:clientId/checkins', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.clientId)) return clientNotFound(res);
  const today = resolveToday(req.query.today);
  const link = await findActiveLink(req.userId, req.params.clientId);
  if (!link) return clientNotFound(res);

  const { rows } = await pool.query(
    `SELECT ${CHECKIN_COLUMNS} FROM checkins
     WHERE user_id = $1 AND coach_id = $2
     ORDER BY week_start DESC
     LIMIT 12`,
    [req.params.clientId, req.userId]
  );
  res.json({ weekStart: weekStartOf(today), checkins: rows.map(toPublicCheckin) });
}));

router.get('/clients/:clientId/summary', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.clientId)) return clientNotFound(res);
  const today = resolveToday(req.query.today);
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
     WHERE user_id = $1 AND weight IS NOT NULL AND date >= $2::date - 30
     ORDER BY date`,
    [req.params.clientId, today]
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

  const weekStart = weekStartOf(today);
  const { rows: checkinRows } = await pool.query(
    `SELECT ${CHECKIN_COLUMNS} FROM checkins
     WHERE user_id = $1 AND coach_id = $2 AND week_start = $3::date`,
    [req.params.clientId, req.userId, weekStart]
  );
  const thisWeek = await fetchThisWeek(req.params.clientId, weekStart, today, weighInRows);

  res.json({
    client: { displayName: client.display_name },
    checkinThisWeek: checkinRows[0] ? toPublicCheckin(checkinRows[0]) : null,
    thisWeek,
    weighIns: weighInRows.map((row) => ({ date: row.date, weight: row.weight })),
    recentSessions: sessionRows.map((row) => ({ id: row.id, date: row.date, notes: row.notes })),
    programs: programRows.map((row) => ({
      id: row.id,
      name: row.name,
      fromMe: row.created_by_coach_id === req.userId,
    })),
  });
}));

// The coach's private note on a client. Only the coach who wrote it can read
// it, and only while their link to that client is active — once the link
// ends, the note is out of reach for everyone (a "not found", never a hint
// that it exists). The client can never reach this route at all: every
// /api/coach route is coach-only.
const MAX_NOTE_LENGTH = 4000;

// Messages with one client. Every request looks up the ACTIVE link between
// this coach and this client in the database; a client who isn't theirs (or
// whose link has ended) gets the same plain "not found" as a made-up id.
router.get('/clients/:clientId/messages', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.clientId)) return clientNotFound(res);
  const thread = await findCoachThread(req.userId, req.params.clientId);
  if (!thread) return clientNotFound(res);
  const messages = await loadMessages(thread.link_id, req.userId);
  res.json({ thread: { otherName: thread.other_name }, messages });
}));

router.post('/clients/:clientId/messages/read', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.clientId)) return clientNotFound(res);
  const thread = await findCoachThread(req.userId, req.params.clientId);
  if (!thread) return clientNotFound(res);
  await markThreadRead(thread.link_id, req.userId);
  res.json({ ok: true });
}));

router.post('/clients/:clientId/messages', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.clientId)) return clientNotFound(res);
  const body = cleanMessageBody(req.body?.body);
  const thread = await findCoachThread(req.userId, req.params.clientId);
  if (!thread) return clientNotFound(res);
  const message = await addMessage(thread.link_id, req.userId, body);
  // The link ended between the two steps above.
  if (!message) return clientNotFound(res);
  res.status(201).json({ message });
}));

// Progress photos the client chose to share, and their body measurements.
// Every request looks up the ACTIVE link between this coach and this client in
// the database. Not their client, a link that has ended, a photo that isn't
// shared, or a photo of someone else: all get the same plain "not found", so
// the answer never hints that a photo exists.
router.get('/clients/:clientId/photos', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.clientId)) return clientNotFound(res);
  const link = await findActiveLink(req.userId, req.params.clientId);
  if (!link) return clientNotFound(res);
  if (!photosEnabled()) return res.json({ enabled: false, photos: [] });

  const { rows } = await pool.query(
    `SELECT ${PHOTO_COLUMNS} FROM progress_photos
     WHERE user_id = $1 AND shared_with_coach = true
     ORDER BY taken_on DESC, created_at DESC, id DESC`,
    [req.params.clientId]
  );
  res.json({ enabled: true, photos: rows.map((row) => toCoachPhoto(row, req.params.clientId)) });
}));

router.get('/clients/:clientId/photos/:photoId/file', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.clientId) || !validate.isUuid(req.params.photoId)) return clientNotFound(res);
  if (!photosEnabled()) return clientNotFound(res);
  // One query proves all three: the link is active and this coach's, the
  // photo belongs to that client, and it is shared.
  const { rows } = await pool.query(
    `SELECT ${PHOTO_COLUMNS} FROM progress_photos
     WHERE id = $1 AND user_id = $2 AND shared_with_coach = true
       AND EXISTS (
         SELECT 1 FROM coach_clients cc
         WHERE cc.coach_id = $3 AND cc.client_id = $2 AND cc.status = 'active'
       )`,
    [req.params.photoId, req.params.clientId, req.userId]
  );
  if (!rows[0]) return clientNotFound(res);
  if (!(await sendPhotoFile(res, rows[0]))) return clientNotFound(res);
}));

router.get('/clients/:clientId/measurements', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.clientId)) return clientNotFound(res);
  const today = resolveToday(req.query.today);
  const days = cleanDays(req.query.days);
  const link = await findActiveLink(req.userId, req.params.clientId);
  if (!link) return clientNotFound(res);
  res.json({ measurements: await loadMeasurements(req.params.clientId, today, days) });
}));

function toPublicNote(row) {
  return { body: row.body, updatedAt: row.updated_at };
}

router.get('/clients/:clientId/notes', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.clientId)) return clientNotFound(res);
  const link = await findActiveLink(req.userId, req.params.clientId);
  if (!link) return clientNotFound(res);

  const { rows } = await pool.query(
    'SELECT body, updated_at FROM coach_notes WHERE coach_id = $1 AND client_id = $2',
    [req.userId, req.params.clientId]
  );
  res.json({ note: rows[0] ? toPublicNote(rows[0]) : null });
}));

router.put('/clients/:clientId/notes', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.clientId)) return clientNotFound(res);

  // A missing or blank note means "clear it"; anything else must be text of a
  // sane length. Checked before the link lookup so a bad body is a quick 400.
  const raw = req.body?.body;
  if (raw != null && typeof raw !== 'string') {
    throw new validate.ValidationError('body must be text');
  }
  const body = (raw ?? '').trim();
  if (body.length > MAX_NOTE_LENGTH) {
    throw new validate.ValidationError(`body must be no more than ${MAX_NOTE_LENGTH} characters long`);
  }

  const link = await findActiveLink(req.userId, req.params.clientId);
  if (!link) return clientNotFound(res);

  if (body === '') {
    await pool.query(
      'DELETE FROM coach_notes WHERE coach_id = $1 AND client_id = $2',
      [req.userId, req.params.clientId]
    );
    return res.json({ note: null });
  }

  const { rows } = await pool.query(
    `INSERT INTO coach_notes (coach_id, client_id, body)
     VALUES ($1, $2, $3)
     ON CONFLICT (coach_id, client_id) DO UPDATE SET body = EXCLUDED.body, updated_at = now()
     RETURNING body, updated_at`,
    [req.userId, req.params.clientId, body]
  );
  res.json({ note: toPublicNote(rows[0]) });
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
