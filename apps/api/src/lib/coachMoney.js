import { pool } from '../db/pool.js';
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS, ratePercentFor } from './commission.js';

// Reads shared by the coach money screens, the accept check and the webhook.
// Every function takes a `db` (the pool or a transaction's client) so it can
// join a transaction, and every query is scoped to the coach it is asked about.

// How many students are paying this coach right now (a failed renewal still
// counts: the provider is retrying and they keep access).
export async function payingStudentCount(db, coachId) {
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT s.user_id)::int AS n
     FROM student_subscriptions s
     JOIN coach_clients cc ON cc.id = s.coach_client_id
     WHERE cc.coach_id = $1 AND s.kind = 'coach' AND s.status IN ('active', 'past_due')`,
    [coachId]
  );
  return rows[0].n;
}

// The three things a coach needs before taking a paying student.
export async function coachReadiness(db, coachId) {
  const { rows } = await db.query(
    `SELECT cs.startup_fee_paid_at, cs.identity_verified, cs.provider_account_id, p.price_cents
     FROM users u
     LEFT JOIN coach_subscriptions cs ON cs.coach_id = u.id
     LEFT JOIN coach_profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [coachId]
  );
  const row = rows[0] ?? {};
  const startupFeePaid = row.startup_fee_paid_at != null;
  const identityVerified = row.identity_verified === true;
  const priceCents = row.price_cents ?? null;
  return {
    startupFeePaidAt: row.startup_fee_paid_at ?? null,
    startupFeePaid,
    identityVerified,
    providerAccountId: row.provider_account_id ?? null,
    priceCents,
    ready: startupFeePaid && identityVerified && priceCents != null,
  };
}

// The shape the coach's "Get paid" card reads.
export async function loadCoachBilling(db, coachId) {
  const readiness = await coachReadiness(db, coachId);
  const students = await payingStudentCount(db, coachId);
  const { rows } = await db.query(`SELECT role FROM users WHERE id = $1`, [coachId]);
  return {
    startupFeePaidOn: readiness.startupFeePaidAt ? new Date(readiness.startupFeePaidAt).toISOString().slice(0, 10) : null,
    identityVerified: readiness.identityVerified,
    // Steps 1 and 2 done: the coach is "Active" on the card.
    active: readiness.startupFeePaid && readiness.identityVerified,
    // Steps 1 and 2 done AND a price set: accepting a paying student is allowed.
    readyForStudents: readiness.ready,
    priceCents: readiness.priceCents,
    minPriceCents: MIN_PRICE_CENTS,
    maxPriceCents: MAX_PRICE_CENTS,
    payingStudents: students,
    ratePercent: ratePercentFor(students),
    // A former coach (access revoked) can still see what they are owed.
    revoked: rows[0]?.role !== 'coach',
  };
}

// A coach's own money figures, in whole cents. Under Method B ("cut") what is
// owed is the sum of unpaid rows Cut collected (refunds and chargebacks are
// negative, so they net off). Rows the payment company settles itself
// ("provider") are never "owed" by Cut.
export async function loadEarnings(db, coachId) {
  const { rows } = await db.query(
    `SELECT
       COALESCE(SUM(coach_cents), 0)::int AS all_time,
       COALESCE(SUM(coach_cents) FILTER (
         WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
       ), 0)::int AS this_month,
       COUNT(DISTINCT student_id) FILTER (
         WHERE kind = 'payment'
           AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
       )::int AS students_this_month,
       COALESCE(SUM(coach_cents) FILTER (WHERE settled_by = 'cut' AND payout_id IS NULL), 0)::int AS owed,
       COALESCE(SUM(coach_cents) FILTER (WHERE settled_by = 'provider'), 0)::int AS provider_settled
     FROM commission_ledger
     WHERE coach_id = $1`,
    [coachId]
  );
  const { rows: paidRows } = await db.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::int AS paid
     FROM payouts WHERE coach_id = $1 AND status IN ('pending', 'paid')`,
    [coachId]
  );
  const r = rows[0];
  return {
    allTimeCents: r.all_time,
    thisMonthCents: r.this_month,
    studentsThisMonth: r.students_this_month,
    owedCents: r.owed,
    paidCents: paidRows[0].paid + Math.max(r.provider_settled, 0),
  };
}

// Is this person a coach now, or were they one (they have money records)?
// Former coaches can still read their own money; nobody else gets a screen.
export async function isCurrentOrFormerCoach(userId) {
  const { rows } = await pool.query(
    `SELECT (u.role = 'coach'
             OR EXISTS (SELECT 1 FROM commission_ledger l WHERE l.coach_id = u.id)
             OR EXISTS (SELECT 1 FROM payouts p WHERE p.coach_id = u.id)
             OR EXISTS (SELECT 1 FROM coach_subscriptions c WHERE c.coach_id = u.id)) AS yes
     FROM users u WHERE u.id = $1`,
    [userId]
  );
  return rows[0]?.yes === true;
}
