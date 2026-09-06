import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import * as validate from '../lib/validate.js';
import { Rollback, withTransaction } from '../lib/withTransaction.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { toPublicApplication } from './coachApplications.js';

// The owner's side of "Become a coach": review the queue, approve or decline,
// and revoke a coach later. This is the only admin capability in Cut. Every
// route answers 404 to anyone who is not the admin (see requireAdmin).

const router = Router();

const STATUSES = ['pending', 'approved', 'declined', 'all'];

function notFound(res, message = 'Not found') {
  return res.status(404).json({ error: { message, code: 'NOT_FOUND' } });
}

router.use(requireAuth, requireAdmin);

router.get('/coach-applications', asyncHandler(async (req, res) => {
  const status = validate.oneOf(req.query.status ?? 'pending', STATUSES, 'status');
  // Pending first so the queue is on top, then newest first within each group.
  const { rows } = await pool.query(
    `SELECT a.*, u.email AS applicant_email, u.display_name AS applicant_name
     FROM coach_applications a
     JOIN users u ON u.id = a.user_id
     WHERE ($1::text = 'all' OR a.status = $1::text)
     ORDER BY (a.status = 'pending') DESC, a.created_at DESC`,
    [status]
  );
  res.json({
    applications: rows.map((row) => ({
      ...toPublicApplication(row),
      applicantEmail: row.applicant_email,
      applicantName: row.applicant_name,
    })),
  });
}));

router.post('/coach-applications/:id/approve', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return notFound(res, 'Application not found');

  const application = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE coach_applications
       SET status = 'approved', decided_by = $2, decided_at = now(), decision_reason = NULL
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [req.params.id, req.userId]
    );
    if (!rows[0]) {
      notFound(res, 'Application not found');
      throw new Rollback();
    }
    // Approval is the one legitimate path that makes someone a coach.
    await client.query(`UPDATE users SET role = 'coach' WHERE id = $1`, [rows[0].user_id]);
    // Email hook: when Cut gets an email transport, the 'you've been approved' message would be sent from here. No email is sent today.
    return rows[0];
  });
  if (!application) return;
  res.json({ application: toPublicApplication(application) });
}));

router.post('/coach-applications/:id/decline', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return notFound(res, 'Application not found');
  const reason = validate.stringLength(req.body?.reason, 'reason', { max: 300, optional: true });

  const { rows } = await pool.query(
    `UPDATE coach_applications
     SET status = 'declined', decided_by = $2, decided_at = now(), decision_reason = $3::text
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [req.params.id, req.userId, reason]
  );
  if (!rows[0]) return notFound(res, 'Application not found');
  // Email hook: when Cut gets an email transport, the 'you've been declined' message would be sent from here. No email is sent today.
  res.json({ application: toPublicApplication(rows[0]) });
}));

// Everyone who is a coach right now. "Coaching since" is when their
// application was approved, or the account's creation date for coaches who
// were promoted before applications existed.
router.get('/coaches', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.display_name, u.email,
            COALESCE(
              (SELECT MAX(a.decided_at) FROM coach_applications a
               WHERE a.user_id = u.id AND a.status = 'approved'),
              u.created_at
            ) AS coaching_since
     FROM users u
     WHERE u.role = 'coach'
     ORDER BY u.display_name`
  );
  res.json({
    coaches: rows.map((row) => ({
      userId: row.id,
      displayName: row.display_name,
      email: row.email,
      coachingSince: row.coaching_since,
    })),
  });
}));

// Revoke: the coach becomes a regular account and every link to their clients
// is marked 'revoked'. Nothing else is touched — clients keep every log,
// program and record in their own accounts.
router.post('/coaches/:userId/revoke', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.userId)) return notFound(res, 'Coach not found');

  const revoked = await withTransaction(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE users SET role = 'consumer' WHERE id = $1 AND role = 'coach'`,
      [req.params.userId]
    );
    if (rowCount === 0) {
      notFound(res, 'Coach not found');
      throw new Rollback(false);
    }
    await client.query(
      `UPDATE coach_clients SET status = 'revoked'
       WHERE coach_id = $1 AND status IN ('active', 'pending')`,
      [req.params.userId]
    );
    return true;
  });
  if (!revoked) return;
  res.json({ userId: req.params.userId, revoked: true });
}));

export default router;
