import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { isPayoutsEnabled, payoutMethod } from '../lib/billing/index.js';
import { ensureCoachProfile } from '../lib/coachProfiles.js';
import { runPayoutsMethodB } from '../lib/payoutRun.js';
import { stopSubscriptionsWhere } from '../lib/stopSubscriptions.js';
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
    // Every coach gets a profile (web address + referral link) the moment
    // they're approved; they fill in the rest under More → Your coach profile.
    await ensureCoachProfile(client, rows[0].user_id, rows[0].display_name);
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
       WHERE coach_id = $1 AND status IN ('active', 'pending', 'requested', 'pending_payment')`,
      [req.params.userId]
    );
    return true;
  });
  if (!revoked) return;
  // Their students' monthly payments stop too. The coach's unpaid earnings
  // stay in the ledger, listed and payable (revoking access is not forgiving
  // a debt).
  await stopSubscriptionsWhere('cc.coach_id = $1', [req.params.userId]);
  res.json({ userId: req.params.userId, revoked: true });
}));

// ---- Coach money (owner only) ---------------------------------------------

// Everyone who is, or ever was, a coach with money on the books. Revoked
// coaches are included: what they have earned stays listed and payable.
router.get('/coaches/earnings', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.display_name, u.email, u.role,
            COALESCE(cs.identity_verified, false) AS identity_verified,
            (cs.provider_account_id IS NOT NULL) AS has_account,
            COALESCE(l.owed, 0) AS owed,
            COALESCE(l.provider_settled, 0) AS provider_settled,
            COALESCE(pd.paid, 0) AS paid
     FROM users u
     LEFT JOIN coach_subscriptions cs ON cs.coach_id = u.id
     LEFT JOIN (
       SELECT coach_id,
              SUM(coach_cents) FILTER (WHERE settled_by = 'cut' AND payout_id IS NULL)::int AS owed,
              SUM(coach_cents) FILTER (WHERE settled_by = 'provider')::int AS provider_settled
       FROM commission_ledger GROUP BY coach_id
     ) l ON l.coach_id = u.id
     LEFT JOIN (
       SELECT coach_id, SUM(amount_cents) FILTER (WHERE status IN ('pending', 'paid'))::int AS paid
       FROM payouts GROUP BY coach_id
     ) pd ON pd.coach_id = u.id
     WHERE u.role = 'coach' OR l.coach_id IS NOT NULL OR pd.coach_id IS NOT NULL
     ORDER BY u.display_name`
  );

  const coaches = rows.map((row) => ({
    userId: row.id,
    displayName: row.display_name,
    email: row.email,
    revoked: row.role !== 'coach',
    identityVerified: row.identity_verified === true,
    owedCents: row.owed,
    paidCents: row.paid + Math.max(row.provider_settled, 0),
    // Can be sent money: passed the identity check and has a payment account.
    payable: row.identity_verified === true && row.has_account === true,
  }));
  const owing = coaches.filter((c) => c.owedCents > 0);
  const payable = owing.filter((c) => c.payable);
  res.json({
    totalOwedCents: owing.reduce((sum, c) => sum + c.owedCents, 0),
    payableCents: payable.reduce((sum, c) => sum + c.owedCents, 0),
    payableCoachCount: payable.length,
    skippedCoachCount: owing.length - payable.length,
    coaches: coaches.map(({ payable: _payable, ...rest }) => rest),
    negativeBalances: coaches
      .filter((c) => c.owedCents < 0)
      .map((c) => ({ userId: c.userId, displayName: c.displayName, owedCents: c.owedCents })),
  });
}));

// "Pay coaches now". Owner only (requireAdmin above answers 404 to anyone
// else). Method A: the payment company pays coaches itself, so nothing is sent
// from here. Method B: runs the locked payout (lib/payoutRun.js).
router.post('/payouts/run', asyncHandler(async (_req, res) => {
  const method = payoutMethod();
  if (!method || !isPayoutsEnabled()) {
    return res.status(503).json({
      error: { message: "Payouts aren't switched on yet.", code: 'PAYOUTS_DISABLED' },
    });
  }
  if (method === 'A') {
    return res.json({
      method: 'A',
      started: 0,
      totalCents: 0,
      failed: 0,
      message: 'The payment company pays coaches directly. Nothing to send from here.',
    });
  }
  const result = await runPayoutsMethodB();
  if (result.busy) {
    return res.status(409).json({
      error: { message: 'A payout run is already going. Wait for it to finish.', code: 'PAYOUT_IN_PROGRESS' },
    });
  }
  res.json({ method: 'B', ...result });
}));

router.get('/payouts', asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  const { rows } = await pool.query(
    `SELECT p.id, p.coach_id, p.amount_cents, p.status, p.provider_reference, p.created_at, u.display_name
     FROM payouts p
     JOIN users u ON u.id = p.coach_id
     ORDER BY p.created_at DESC, p.id
     LIMIT $1 OFFSET $2`,
    [limit + 1, offset]
  );
  res.json({
    payouts: rows.slice(0, limit).map((row) => ({
      id: row.id,
      coach: { userId: row.coach_id, displayName: row.display_name },
      amountCents: row.amount_cents,
      status: row.status,
      providerRef: row.provider_reference,
      createdAt: row.created_at,
    })),
    hasMore: rows.length > limit,
  });
}));

export default router;
