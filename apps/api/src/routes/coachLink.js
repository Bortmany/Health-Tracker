import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import * as validate from '../lib/validate.js';
import { Rollback, withTransaction } from '../lib/withTransaction.js';
import { requireAuth } from '../middleware/auth.js';

// The student's side of coaching: redeem an invite code, ask a coach from the
// directory, answer a coach's invite, see or end the current link. Every
// query is scoped to the signed-in user (client_id = req.userId).

const router = Router();

function requestNotFound(res) {
  return res.status(404).json({ error: { message: 'Request not found', code: 'NOT_FOUND' } });
}

function inviteNotFound(res) {
  return res.status(404).json({ error: { message: 'Invite not found', code: 'NOT_FOUND' } });
}

function hasCoach(res) {
  return res.status(409).json({
    error: { message: 'You already have a coach. End that link first under More.', code: 'HAS_COACH' },
  });
}

// Once a student has a coach, any request they still had out to other coaches
// is withdrawn (marked declined) so it doesn't sit in those coaches' queues
// only to fail with "already has a coach" later.
async function closeOwnOpenRequests(client, clientId) {
  await client.query(
    `UPDATE coach_clients SET status = 'declined'
     WHERE client_id = $1 AND status = 'requested' AND requested_by IN ('client', 'referral')`,
    [clientId]
  );
}

// A coach as the student sees them: name and public address only.
function toLinkedCoach(row) {
  return { displayName: row.display_name, slug: row.slug ?? null };
}

router.use(requireAuth);

router.post('/redeem', asyncHandler(async (req, res) => {
  const { code } = req.body ?? {};
  // Must be plain text: an array/object here would bind as a non-text value and
  // break the `invite_code = $1` comparison (a 500). A cap also keeps a runaway
  // value from reaching the query. Codes are short, so 100 chars is generous.
  if (typeof code !== 'string' || code.trim() === '') {
    return res.status(400).json({ error: { message: 'code is required', code: 'INVALID_INPUT' } });
  }
  if (code.length > 100) {
    return res.status(400).json({ error: { message: 'That invite code is not valid', code: 'INVALID_INPUT' } });
  }

  // Everything runs in one transaction with the invite row locked, so two
  // people redeeming at once (or one person redeeming two codes at once)
  // can't slip past the checks. When a check fails, the response is sent and
  // Rollback aborts the transaction, leaving `coach` empty.
  const coach = await withTransaction(async (client) => {
    const { rows: inviteRows } = await client.query(
      `SELECT * FROM coach_clients WHERE invite_code = $1 AND status = 'pending' FOR UPDATE`,
      [code]
    );
    const invite = inviteRows[0];
    if (!invite) {
      res.status(404).json({
        error: { message: 'That invite code was not found or has already been used', code: 'NOT_FOUND' },
      });
      throw new Rollback();
    }

    if (invite.coach_id === req.userId) {
      res.status(400).json({
        error: { message: "You can't use your own invite code", code: 'INVALID_INPUT' },
      });
      throw new Rollback();
    }

    const { rows: existingRows } = await client.query(
      `SELECT coach_id FROM coach_clients WHERE client_id = $1 AND status = 'active' FOR UPDATE`,
      [req.userId]
    );
    const existing = existingRows[0];
    if (existing) {
      if (existing.coach_id === invite.coach_id) {
        res.status(400).json({
          error: { message: "You're already connected to this coach", code: 'ALREADY_CONNECTED' },
        });
      } else {
        res.status(400).json({
          error: { message: 'You already have a coach. Remove them first under More.', code: 'HAS_COACH' },
        });
      }
      throw new Rollback();
    }

    const { rows, rowCount } = await client.query(
      `UPDATE coach_clients SET client_id = $1, status = 'active'
       WHERE id = $2 AND status = 'pending'
       RETURNING coach_id`,
      [req.userId, invite.id]
    );
    if (rowCount === 0) {
      res.status(404).json({
        error: { message: 'That invite code was not found or has already been used', code: 'NOT_FOUND' },
      });
      throw new Rollback();
    }
    await closeOwnOpenRequests(client, req.userId);

    const { rows: coachRows } = await client.query('SELECT display_name FROM users WHERE id = $1', [
      rows[0].coach_id,
    ]);
    return { displayName: coachRows[0]?.display_name ?? null };
  });

  if (!coach) return;
  res.json({ coach });
}));

router.get('/', asyncHandler(async (req, res) => {
  // One read covers the current coach, my own outgoing request and any
  // invites coaches have sent me. Coaches are joined to their profile for the
  // slug (LEFT JOIN: a coach without a profile row still shows by name).
  const { rows } = await pool.query(
    `SELECT cc.id, cc.status, cc.requested_by, cc.created_at, u.display_name, p.slug
     FROM coach_clients cc
     JOIN users u ON u.id = cc.coach_id
     LEFT JOIN coach_profiles p ON p.user_id = cc.coach_id
     WHERE cc.client_id = $1 AND cc.status IN ('active', 'requested')
     ORDER BY cc.created_at DESC`,
    [req.userId]
  );
  const active = rows.find((row) => row.status === 'active');
  const pending = rows.find((row) => row.status === 'requested' && row.requested_by !== 'coach');
  const invites = rows.filter((row) => row.status === 'requested' && row.requested_by === 'coach');
  res.json({
    coach: active ? toLinkedCoach(active) : null,
    pendingRequest: pending
      ? { id: pending.id, coach: toLinkedCoach(pending), createdAt: pending.created_at }
      : null,
    coachInvites: invites.map((row) => ({
      id: row.id,
      coach: toLinkedCoach(row),
      createdAt: row.created_at,
    })),
  });
}));

// Ask a coach from the directory to work with me. Only public profiles can be
// requested here, and a private one answers "not found" so the address of a
// coach who hasn't gone public isn't confirmed. (A private coach's referral
// link still works — that path lives in the register route.)
router.post('/requests', asyncHandler(async (req, res) => {
  const coachSlug = validate.stringLength(req.body?.coachSlug, 'coachSlug', { max: 100 });
  const { rows: coachRows } = await pool.query(
    `SELECT p.user_id, p.accepting_clients, p.slug, u.display_name
     FROM coach_profiles p
     JOIN users u ON u.id = p.user_id AND u.role = 'coach'
     WHERE p.slug = $1 AND p.is_public = true`,
    [coachSlug]
  );
  const coach = coachRows[0];
  if (!coach) {
    return res.status(404).json({ error: { message: 'Coach not found', code: 'NOT_FOUND' } });
  }
  if (coach.user_id === req.userId) {
    return res.status(400).json({ error: { message: "You can't request yourself as a coach", code: 'INVALID_INPUT' } });
  }

  let request;
  try {
    request = await withTransaction(async (client) => {
      // Lock my live rows so two requests sent at once can't both get through.
      const { rows: mine } = await client.query(
        `SELECT status, requested_by FROM coach_clients
         WHERE client_id = $1 AND status IN ('active', 'requested')
         FOR UPDATE`,
        [req.userId]
      );
      if (mine.some((row) => row.status === 'active')) {
        hasCoach(res);
        throw new Rollback();
      }
      if (mine.some((row) => row.status === 'requested' && row.requested_by !== 'coach')) {
        res.status(409).json({
          error: { message: 'You already have a request waiting on a coach. Cancel it first under More.', code: 'REQUEST_PENDING' },
        });
        throw new Rollback();
      }
      if (coach.accepting_clients !== true) {
        res.status(409).json({
          error: { message: `${coach.display_name} isn't taking new clients right now.`, code: 'NOT_ACCEPTING' },
        });
        throw new Rollback();
      }
      const { rows } = await client.query(
        `INSERT INTO coach_clients (coach_id, client_id, status, requested_by)
         VALUES ($1, $2, 'requested', 'client')
         RETURNING id, created_at`,
        [coach.user_id, req.userId]
      );
      return rows[0];
    });
  } catch (err) {
    // The same coach already has a live row with me — an invite they sent me
    // that I haven't answered yet.
    if (err.code === '23505') {
      return res.status(409).json({
        error: { message: 'This coach has already invited you. Accept their invite under More.', code: 'REQUEST_PENDING' },
      });
    }
    throw err;
  }
  if (!request) return;
  res.status(201).json({
    request: {
      id: request.id,
      coach: { displayName: coach.display_name, slug: coach.slug },
      createdAt: request.created_at,
    },
  });
}));

// Cancel my own request. It's marked declined (not deleted) so the history stays.
router.delete('/requests/:id', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return requestNotFound(res);
  const { rowCount } = await pool.query(
    `UPDATE coach_clients SET status = 'declined'
     WHERE id = $1 AND client_id = $2 AND status = 'requested' AND requested_by IN ('client', 'referral')`,
    [req.params.id, req.userId]
  );
  if (!rowCount) return requestNotFound(res);
  res.status(204).end();
}));

// Accept a coach's invite. With a coach already, the student must confirm
// (replaceCurrent: true) — that ends the old link before the new one starts,
// so nobody ever has two active coaches.
router.post('/invites/:id/accept', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return inviteNotFound(res);
  const replaceCurrent = validate.boolean(req.body?.replaceCurrent, 'replaceCurrent', { optional: true }) === true;

  const coach = await withTransaction(async (client) => {
    const { rows: inviteRows } = await client.query(
      `SELECT cc.id, cc.coach_id FROM coach_clients cc
       WHERE cc.id = $1 AND cc.client_id = $2 AND cc.status = 'requested' AND cc.requested_by = 'coach'
       FOR UPDATE`,
      [req.params.id, req.userId]
    );
    const invite = inviteRows[0];
    if (!invite) {
      inviteNotFound(res);
      throw new Rollback();
    }
    const { rows: activeRows } = await client.query(
      `SELECT id FROM coach_clients WHERE client_id = $1 AND status = 'active' FOR UPDATE`,
      [req.userId]
    );
    if (activeRows[0]) {
      if (!replaceCurrent) {
        hasCoach(res);
        throw new Rollback();
      }
      await client.query(
        `UPDATE coach_clients SET status = 'ended', ended_at = now() WHERE id = $1 AND client_id = $2`,
        [activeRows[0].id, req.userId]
      );
    }
    await client.query(`UPDATE coach_clients SET status = 'active' WHERE id = $1`, [invite.id]);
    await closeOwnOpenRequests(client, req.userId);
    const { rows } = await client.query(
      `SELECT u.display_name, p.slug FROM users u
       LEFT JOIN coach_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [invite.coach_id]
    );
    return toLinkedCoach(rows[0] ?? {});
  });
  if (!coach) return;
  res.json({ coach });
}));

router.post('/invites/:id/decline', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return inviteNotFound(res);
  const { rowCount } = await pool.query(
    `UPDATE coach_clients SET status = 'declined'
     WHERE id = $1 AND client_id = $2 AND status = 'requested' AND requested_by = 'coach'`,
    [req.params.id, req.userId]
  );
  if (!rowCount) return inviteNotFound(res);
  res.status(204).end();
}));

// End my current coaching link. The row stays, marked 'ended', and everything
// in my account (logs, programs the coach assigned) stays exactly as it is.
router.delete('/', asyncHandler(async (req, res) => {
  await pool.query(
    `UPDATE coach_clients SET status = 'ended', ended_at = now() WHERE client_id = $1 AND status = 'active'`,
    [req.userId]
  );
  res.status(204).end();
}));

export default router;
