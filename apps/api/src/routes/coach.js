import crypto from 'crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
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
  const link = await findActiveLink(req.userId, req.params.clientId);
  if (!link) {
    return res.status(404).json({ error: { message: 'Client not found', code: 'NOT_FOUND' } });
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
  const link = await findActiveLink(req.userId, req.params.clientId);
  if (!link) {
    return res.status(404).json({ error: { message: 'Client not found', code: 'NOT_FOUND' } });
  }

  const { name, description, days = [] } = req.body ?? {};
  if (!name) {
    return res.status(400).json({ error: { message: 'name is required', code: 'INVALID_INPUT' } });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO programs (user_id, name, description, created_by_coach_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.clientId, name, description ?? null, req.userId]
    );
    const program = rows[0];
    await replaceDays(client, program.id, days);
    await client.query('COMMIT');
    res.status(201).json({ program: toPublicProgram(program, await fetchNestedDays(pool, program.id)) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.put('/clients/:clientId/programs/:programId', asyncHandler(async (req, res) => {
  const link = await findActiveLink(req.userId, req.params.clientId);
  if (!link) {
    return res.status(404).json({ error: { message: 'Client not found', code: 'NOT_FOUND' } });
  }

  const { name, description, archived, days } = req.body ?? {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: ownedRows } = await client.query(
      `SELECT id FROM programs
       WHERE id = $1 AND user_id = $2 AND created_by_coach_id = $3`,
      [req.params.programId, req.params.clientId, req.userId]
    );
    if (!ownedRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { message: 'Program not found', code: 'NOT_FOUND' } });
    }

    const { rows } = await client.query(
      `UPDATE programs
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           archived_at = CASE WHEN $4::boolean IS NULL THEN archived_at
                               WHEN $4::boolean THEN now()
                               ELSE NULL END
       WHERE id = $1
       RETURNING *`,
      [req.params.programId, name ?? null, description ?? null, archived ?? null]
    );
    const program = rows[0];

    if (days) {
      await replaceDays(client, program.id, days);
    }

    await client.query('COMMIT');
    res.json({ program: toPublicProgram(program, await fetchNestedDays(pool, program.id)) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

export default router;
