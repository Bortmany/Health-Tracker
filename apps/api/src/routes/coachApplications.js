import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import * as validate from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';

// "Become a coach" — the applicant's side. Every query here is scoped to the
// signed-in user; nobody can read or withdraw anyone else's application.
// The admin side (approve / decline / revoke) lives in routes/admin.js.

const router = Router();

// At most this many applications per person, ever: the original plus one
// reapply after a decline. A second decline locks reapplication for good.
const MAX_APPLICATIONS = 2;

export function toPublicApplication(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    credentials: row.credentials,
    yearsCoaching: row.years_coaching,
    approach: row.approach,
    link: row.link,
    agreedToTerms: row.agreed_to_terms === true,
    status: row.status,
    decisionReason: row.decision_reason,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

function notFound(res) {
  return res.status(404).json({ error: { message: 'Application not found', code: 'NOT_FOUND' } });
}

// Optional link to the coach's Instagram or website. Must be a real web
// address (http or https) — anything else (javascript:, file:, plain text)
// is refused so the admin screen never renders an unsafe link.
function validateLink(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') {
    throw new validate.ValidationError('link must be text');
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > 300) {
    throw new validate.ValidationError('link must be no more than 300 characters long');
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new validate.ValidationError('link must be a full web address, like https://example.com');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new validate.ValidationError('link must start with http:// or https://');
  }
  return trimmed;
}

router.use(requireAuth);

// The signed-in user's latest application (or null) and whether they may
// submit another one right now.
router.get('/mine', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT *, COUNT(*) OVER () AS total FROM coach_applications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [req.userId]
  );
  const latest = rows[0] ?? null;
  const total = latest ? Number(latest.total) : 0;
  const canReapply = !latest || (latest.status === 'declined' && total < MAX_APPLICATIONS);
  res.json({ application: latest ? toPublicApplication(latest) : null, canReapply });
}));

router.post('/', asyncHandler(async (req, res) => {
  // Order matters: refuse a duplicate or a locked-out account before looking at
  // the form, so the message names the real reason.
  const { rows: existing } = await pool.query(
    `SELECT status FROM coach_applications WHERE user_id = $1`,
    [req.userId]
  );
  if (existing.some((a) => a.status === 'pending')) {
    return res.status(409).json({
      error: { message: 'You already have an application waiting for review.', code: 'APPLICATION_PENDING' },
    });
  }
  if (existing.length >= MAX_APPLICATIONS || existing.some((a) => a.status === 'approved')) {
    return res.status(403).json({
      error: {
        message: existing.some((a) => a.status === 'approved')
          ? 'Your coach application was already approved.'
          : 'You have used all your coach applications. Please contact us if you think this is a mistake.',
        code: 'REAPPLY_LIMIT',
      },
    });
  }

  const body = req.body ?? {};
  const displayName = validate.stringLength(body.displayName, 'displayName', { max: 100 });
  const credentials = validate.stringLength(body.credentials, 'credentials', { max: 1000 });
  const yearsCoaching = validate.nonNegativeNumber(body.yearsCoaching, 'yearsCoaching', { integer: true, max: 60 });
  const approach = validate.stringLength(body.approach, 'approach', { max: 500 });
  const link = validateLink(body.link);
  if (body.agreedToTerms !== true) {
    return res.status(400).json({
      error: { message: 'agreedToTerms: you must agree to the coach terms to apply', code: 'INVALID_INPUT' },
    });
  }

  let row;
  try {
    const { rows } = await pool.query(
      `INSERT INTO coach_applications
         (user_id, display_name, credentials, years_coaching, approach, link, agreed_to_terms)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [req.userId, displayName, credentials, yearsCoaching, approach, link]
    );
    row = rows[0];
  } catch (err) {
    // Two submissions at the same moment: the one-pending-per-user index
    // stops the second one, which is the same "already pending" answer.
    if (err.code === '23505') {
      return res.status(409).json({
        error: { message: 'You already have an application waiting for review.', code: 'APPLICATION_PENDING' },
      });
    }
    throw err;
  }
  res.status(201).json({ application: toPublicApplication(row) });
}));

// Withdraw: deletes the caller's own pending application so it never counts
// against their limit. Anything else (someone else's, already decided, a
// malformed id) is the same "not found" — never a hint that it exists.
router.delete('/:id', asyncHandler(async (req, res) => {
  if (!validate.isUuid(req.params.id)) return notFound(res);
  const { rowCount } = await pool.query(
    `DELETE FROM coach_applications WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
    [req.params.id, req.userId]
  );
  if (rowCount === 0) return notFound(res);
  res.status(204).end();
}));

export default router;
