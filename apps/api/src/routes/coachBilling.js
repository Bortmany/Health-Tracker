import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { billingConfig, getBillingClient, payoutMethod } from '../lib/billing/index.js';
import { ensureCoachProfile } from '../lib/coachProfiles.js';
import {
  coachReadiness,
  isCurrentOrFormerCoach,
  loadCoachBilling,
  loadEarnings,
} from '../lib/coachMoney.js';
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS, STARTUP_FEE_CENTS, isValidPriceCents } from '../lib/commission.js';
import { logger } from '../lib/logger.js';
import { withTransaction } from '../lib/withTransaction.js';
import { requireAuth } from '../middleware/auth.js';
import { requireCoach } from '../middleware/requireCoach.js';
import { DISABLED_MESSAGE, openCheckout } from './billing.js';
import { loadMyCoach } from './coachLink.js';
import crypto from 'node:crypto';

// A coach's own money screens. Mounted on /api/coach BEFORE the main coach
// router; paths that aren't named here fall through to it. Every query is
// scoped to the signed-in coach (coach_id = req.userId): a coach sees only
// their own figures, and no student ever reaches these routes with a
// student's account.

const router = Router();

// Reading your own money is allowed to current coaches AND to people whose
// coaching was revoked (their owed money is still theirs). Anyone else gets
// the same "coach accounts only" answer the rest of the coach area gives.
const requireCurrentOrFormerCoach = asyncHandler(async (req, res, next) => {
  if (!(await isCurrentOrFormerCoach(req.userId))) {
    return res.status(403).json({
      error: { message: 'This action is only available to coach accounts', code: 'COACH_ONLY' },
    });
  }
  next();
});

router.get('/billing', requireAuth, requireCurrentOrFormerCoach, asyncHandler(async (req, res) => {
  res.json(await loadCoachBilling(pool, req.userId));
}));

function priceError(res, message) {
  return res.status(400).json({ error: { message, code: 'INVALID_PRICE' } });
}

// Sets the price new students will pay. Existing students keep what they pay.
router.put('/billing/price', requireAuth, requireCoach, asyncHandler(async (req, res) => {
  const price = req.body?.priceCents;
  if (!Number.isSafeInteger(price)) return priceError(res, 'Enter a price, like 30.');
  if (price < MIN_PRICE_CENTS) return priceError(res, 'The lowest price is $10 a month.');
  if (price > MAX_PRICE_CENTS) return priceError(res, 'The highest price is $500 a month.');
  if (!isValidPriceCents(price)) return priceError(res, 'Enter a price, like 30.');

  const update = () => pool.query(
    `UPDATE coach_profiles SET price_cents = $2, updated_at = now() WHERE user_id = $1`,
    [req.userId, price]
  );
  let { rowCount } = await update();
  if (!rowCount) {
    // A coach promoted before profiles existed: make the profile, then set the price.
    const { rows } = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.userId]);
    await withTransaction((client) => ensureCoachProfile(client, req.userId, rows[0]?.display_name));
    ({ rowCount } = await update());
  }
  res.json(await loadCoachBilling(pool, req.userId));
}));

// Step 1: the one-time startup fee.
router.post('/billing/startup-fee', requireAuth, requireCoach, asyncHandler(async (req, res) => {
  const config = billingConfig();
  if (!config) return res.status(503).json(DISABLED_MESSAGE);
  const readiness = await coachReadiness(pool, req.userId);
  if (readiness.startupFeePaid) {
    return res.status(409).json({
      error: { message: "You've already paid the startup fee.", code: 'ALREADY_PAID' },
    });
  }
  return openCheckout(res, {
    kind: 'coach_startup_fee',
    interval: null,
    userId: req.userId,
    amountCents: STARTUP_FEE_CENTS,
    successUrl: `${config.appUrl}/coach/profile#get-paid`,
    cancelUrl: `${config.appUrl}/coach/profile#get-paid`,
    reference: crypto.randomUUID(),
  });
}));

// Step 2: the payment company's identity check. The result ("verified") only
// ever arrives by a signed webhook, never from this call.
router.post('/billing/onboarding', requireAuth, requireCoach, asyncHandler(async (req, res) => {
  const config = billingConfig();
  if (!config) return res.status(503).json(DISABLED_MESSAGE);
  const readiness = await coachReadiness(pool, req.userId);
  if (!readiness.startupFeePaid) {
    return res.status(409).json({
      error: { message: 'Pay the startup fee first.', code: 'STARTUP_FEE_REQUIRED' },
    });
  }
  const billing = getBillingClient();
  if (!billing) return res.status(503).json(DISABLED_MESSAGE);
  let result;
  try {
    result = await billing.createCoachOnboardingLink({
      coachUserId: req.userId,
      providerAccountId: readiness.providerAccountId,
      returnUrl: `${config.appUrl}/coach/profile#get-paid`,
    });
  } catch (err) {
    logger.error('Could not create an identity-check link', { error: err });
  }
  if (!result?.url) {
    return res.status(502).json({
      error: { message: "We couldn't open the identity check. Please try again in a moment.", code: 'ONBOARDING_UNAVAILABLE' },
    });
  }
  if (result.providerAccountId) {
    await pool.query(
      `INSERT INTO coach_subscriptions (coach_id, provider_account_id) VALUES ($1, $2)
       ON CONFLICT (coach_id) DO UPDATE
       SET provider_account_id = COALESCE(coach_subscriptions.provider_account_id, $2), updated_at = now()`,
      [req.userId, result.providerAccountId]
    );
  }
  res.json({ url: result.url });
}));

router.get('/earnings', requireAuth, requireCurrentOrFormerCoach, asyncHandler(async (req, res) => {
  const earnings = await loadEarnings(pool, req.userId);
  res.json({
    thisMonthCents: earnings.thisMonthCents,
    allTimeCents: earnings.allTimeCents,
    owedCents: earnings.owedCents,
    paidCents: earnings.paidCents,
    studentsThisMonth: earnings.studentsThisMonth,
    // Who sends the coach their money: 'provider' under Method A, else 'cut'.
    settledBy: payoutMethod() === 'A' ? 'provider' : 'cut',
  });
}));

router.get('/payouts', requireAuth, requireCurrentOrFormerCoach, asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 50);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  const { rows } = await pool.query(
    `SELECT id, created_at, amount_cents, status FROM payouts
     WHERE coach_id = $1
     ORDER BY created_at DESC, id
     LIMIT $2 OFFSET $3`,
    [req.userId, limit + 1, offset]
  );
  res.json({
    payouts: rows.slice(0, limit).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      amountCents: row.amount_cents,
      status: row.status,
    })),
    hasMore: rows.length > limit,
  });
}));

// The student's view of their coaching (also at GET /api/coach-link): any
// signed-in person, scoped to themselves. Includes `pendingPayment`.
router.get('/mine', requireAuth, asyncHandler(async (req, res) => {
  res.json(await loadMyCoach(req.userId));
}));

export default router;
