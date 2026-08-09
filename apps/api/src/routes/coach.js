import crypto from 'crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
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

async function findActiveLink(coachId, clientId) {
  const { rows } = await pool.query(
    `SELECT * FROM coach_clients WHERE coach_id = $1 AND client_id = $2 AND status = 'active'`,
    [coachId, clientId]
  );
  return rows[0] ?? null;
}

router.use(requireAuth, requireCoach);

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

router.delete('/clients/:linkId', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.linkId)) {
    return res.status(404).json({ error: { message: 'Client link not found', code: 'NOT_FOUND' } });
  }
  const { rowCount } = await pool.query(
    'DELETE FROM coach_clients WHERE id = $1 AND coach_id = $2',
    [req.params.linkId, req.userId]
  );
  if (!rowCount) {
    return res.status(404).json({ error: { message: 'Client link not found', code: 'NOT_FOUND' } });
  }
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
