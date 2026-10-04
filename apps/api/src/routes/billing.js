import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  billingConfig,
  getBillingClient,
  isBillingEnabled,
  isPayoutsEnabled,
  parseWebhookEvent,
  payoutMethod,
  verifyWebhook,
} from '../lib/billing/index.js';
import { applyBillingEvent } from '../lib/billingEvents.js';
import {
  AI_MONTHLY_CENTS,
  AI_YEARLY_CENTS,
  ratePercentFor,
} from '../lib/commission.js';
import { coachReadiness, payingStudentCount } from '../lib/coachMoney.js';
import { isEmailEnabled } from '../lib/email.js';
import { isAiPlanGenerationEnabled } from '../lib/aiPlanGenerator.js';
import { verifyTokenPayload } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';
import * as validate from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

export const DISABLED_MESSAGE = {
  error: {
    message: "Payments aren't switched on yet. Please check back soon.",
    code: 'BILLING_DISABLED',
  },
};

function checkoutUnavailable(res) {
  return res.status(502).json({
    error: {
      message: "We couldn't open the payment page. Please try again in a moment.",
      code: 'CHECKOUT_UNAVAILABLE',
    },
  });
}

// The payment company calls this directly, so it can't sit behind login. The
// signature check — done against the raw request bytes, which is why this path
// skips JSON parsing in app.js — is what proves the call really came from the
// payment company and not from somebody who guessed the address. Nothing is
// written until the signature holds. This path is deliberately not rate
// limited: the signature is its protection.
router.post('/webhook', asyncHandler(async (req, res) => {
  const config = billingConfig();
  if (!config) return res.status(503).json(DISABLED_MESSAGE);

  // express.raw gives us a Buffer here; the signature is over those exact bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
  const verdict = verifyWebhook(rawBody, req.headers, config.webhookSecret);
  if (verdict !== 'ok') {
    logger.warn('Rejected a payment webhook', { verdict });
    return res.status(400).json({
      error: { message: 'Invalid signature', code: 'INVALID_SIGNATURE' },
    });
  }

  const event = parseWebhookEvent(rawBody);
  // Unreadable or unknown messages are answered 200 and ignored: anything else
  // makes the payment company retry them for days.
  if (!event || event.type === 'ignored') return res.json({ received: true });

  const outcome = await applyBillingEvent(event);
  res.json({ received: true, duplicate: outcome === 'duplicate' });
}));

// Who is asking, if anyone: the status route is public (the forgot-password
// screen reads it while signed out) but adds the plan when there is a session.
async function optionalUserId(req) {
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    const payload = verifyTokenPayload(token);
    const { rows } = await pool.query('SELECT token_version FROM users WHERE id = $1', [payload.sub]);
    if (rows[0] && rows[0].token_version === (payload.tv ?? 0)) return payload.sub;
  } catch {
    // Not a valid session: treat as signed out.
  }
  return null;
}

router.get('/status', asyncHandler(async (req, res) => {
  const userId = await optionalUserId(req);
  let planTier = null;
  if (userId) {
    const { rows } = await pool.query('SELECT plan_tier FROM users WHERE id = $1', [userId]);
    planTier = rows[0]?.plan_tier ?? 'free';
  }
  const enabled = isBillingEnabled();
  res.json({
    enabled,
    // Same thing under the name the screens read.
    configured: enabled,
    planTier,
    // Whether the AI plan writer is switched on (ANTHROPIC_API_KEY set), so
    // the paid panel can say "not switched on yet" instead of offering it.
    aiPlanEnabled: isAiPlanGenerationEnabled(),
    payouts: { configured: isPayoutsEnabled(), method: payoutMethod() },
    email: { configured: isEmailEnabled() },
  });
}));

router.use(requireAuth);

// ---- Subscriptions -------------------------------------------------------

function dayOf(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function toPublicSubscription(row) {
  return {
    id: row.id,
    kind: row.kind === 'coach' ? 'coach' : row.interval === 'year' ? 'ai_yearly' : 'ai_monthly',
    // A student only ever sees the coach's name and what THEY pay.
    coach: row.kind === 'coach' && row.coach_id
      ? { id: row.coach_id, displayName: row.coach_name }
      : null,
    priceCents: row.price_cents,
    interval: row.interval,
    status: row.status,
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    startedOn: dayOf(row.created_at),
    periodEnd: dayOf(row.current_period_end),
  };
}

const SUBSCRIPTION_SELECT = `
  SELECT s.*, cc.coach_id, cu.display_name AS coach_name
  FROM student_subscriptions s
  LEFT JOIN coach_clients cc ON cc.id = s.coach_client_id
  LEFT JOIN users cu ON cu.id = cc.coach_id`;

router.get('/subscriptions', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `${SUBSCRIPTION_SELECT}
     WHERE s.user_id = $1
     ORDER BY (s.status = 'ended'), s.created_at DESC
     LIMIT 20`,
    [req.userId]
  );
  res.json({ subscriptions: rows.map(toPublicSubscription) });
}));

// Cancel keeps access to the end of the period already paid for: the plan or
// link switches off only when the payment company's "ended" message arrives.
router.post('/subscriptions/:id/cancel', asyncHandler(async (req, res) => {
  const notFound = () => res.status(404).json({ error: { message: 'Subscription not found', code: 'NOT_FOUND' } });
  if (!validate.isUuid(req.params.id)) return notFound();

  const { rows } = await pool.query(
    `${SUBSCRIPTION_SELECT} WHERE s.id = $1 AND s.user_id = $2`,
    [req.params.id, req.userId]
  );
  const sub = rows[0];
  if (!sub) return notFound();
  if (sub.status === 'ended') {
    return res.status(409).json({
      error: { message: 'That subscription has already ended.', code: 'ALREADY_ENDED' },
    });
  }
  // Already cancelled: same answer again, nothing more to do.
  if (sub.cancel_at_period_end) return res.json({ subscription: toPublicSubscription(sub) });

  if (!isBillingEnabled()) return res.status(503).json(DISABLED_MESSAGE);
  const billing = getBillingClient();
  let periodEnd = null;
  if (sub.provider_subscription_id) {
    try {
      const result = await billing.cancelSubscription({ providerSubscriptionId: sub.provider_subscription_id });
      periodEnd = result?.periodEnd ?? null;
    } catch (err) {
      logger.error('Could not cancel a subscription', { subscriptionId: sub.id, error: err });
      return res.status(502).json({
        error: { message: "We couldn't cancel that just now. Please try again in a moment.", code: 'CANCEL_FAILED' },
      });
    }
  }
  const { rows: updated } = await pool.query(
    `UPDATE student_subscriptions
     SET cancel_at_period_end = true,
         current_period_end = COALESCE($3::timestamptz, current_period_end),
         updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [sub.id, req.userId, periodEnd]
  );
  res.json({ subscription: toPublicSubscription({ ...sub, ...updated[0] }) });
}));

// ---- Checkout ------------------------------------------------------------

export async function openCheckout(res, params, extra = {}) {
  const billing = getBillingClient();
  if (!billing) return res.status(503).json(DISABLED_MESSAGE);
  let result;
  try {
    result = await billing.createCheckout(params);
  } catch (err) {
    logger.error('Could not create a checkout', { kind: params.kind, error: err });
    return checkoutUnavailable(res);
  }
  if (!result?.url) return checkoutUnavailable(res);
  // `url` is the old name, `checkoutUrl` the one the screens read.
  return res.json({ url: result.url, checkoutUrl: result.url, ...extra });
}

async function hasLiveAiPlan(userId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM student_subscriptions WHERE user_id = $1 AND kind = 'ai_plan' AND status <> 'ended'`,
    [userId]
  );
  return rows.length > 0;
}

async function startAiCheckout(req, res, interval) {
  const config = billingConfig();
  if (!config) return res.status(503).json(DISABLED_MESSAGE);
  if (await hasLiveAiPlan(req.userId)) {
    return res.status(409).json({
      error: { message: 'You already have the AI plan.', code: 'ALREADY_SUBSCRIBED' },
    });
  }
  return openCheckout(res, {
    kind: 'ai_plan',
    interval,
    userId: req.userId,
    amountCents: interval === 'year' ? AI_YEARLY_CENTS : AI_MONTHLY_CENTS,
    successUrl: `${config.appUrl}/more?upgraded=1`,
    cancelUrl: `${config.appUrl}/account/subscription#plans`,
    reference: crypto.randomUUID(),
  });
}

// The old single "upgrade" button: always the monthly plan.
router.post('/checkout', asyncHandler(async (req, res) => startAiCheckout(req, res, 'month')));

router.post('/ai-checkout', asyncHandler(async (req, res) => {
  const interval = validate.oneOf(req.body?.interval, ['month', 'year'], 'interval');
  return startAiCheckout(req, res, interval);
}));

// A student pays the coach who accepted them. The price comes from the coach's
// own saved price on the server (never from the request), and the link must be
// this student's own, waiting for payment.
router.post('/coach-checkout', asyncHandler(async (req, res) => {
  const config = billingConfig();
  if (!config) return res.status(503).json(DISABLED_MESSAGE);
  const coachId = validate.uuid(req.body?.coachId, 'coachId');

  const { rows } = await pool.query(
    `SELECT cc.id FROM coach_clients cc
     JOIN users u ON u.id = cc.coach_id AND u.role = 'coach'
     WHERE cc.client_id = $1 AND cc.coach_id = $2 AND cc.status = 'pending_payment'`,
    [req.userId, coachId]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: { message: 'Nothing to pay for here.', code: 'NOT_FOUND' } });
  }
  const readiness = await coachReadiness(pool, coachId);
  if (!readiness.ready) {
    return res.status(409).json({
      error: { message: "This coach isn't set up to take payments yet.", code: 'COACH_NOT_READY' },
    });
  }
  const students = await payingStudentCount(pool, coachId);
  return openCheckout(
    res,
    {
      kind: 'coach_student',
      interval: 'month',
      userId: req.userId,
      coachUserId: coachId,
      linkId: rows[0].id,
      amountCents: readiness.priceCents,
      // Under Method A the payment company takes Cut's share on every payment.
      ...(payoutMethod() === 'A' ? { platformFeePercent: ratePercentFor(students + 1) } : {}),
      successUrl: `${config.appUrl}/more?paid=1`,
      cancelUrl: `${config.appUrl}/more?paid=0`,
      reference: crypto.randomUUID(),
    },
    { priceCents: readiness.priceCents }
  );
}));

export default router;
