import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getStripe, isBillingEnabled } from '../lib/billing.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const DISABLED_MESSAGE = {
  error: {
    message: "Upgrades aren't switched on yet. Premium is coming soon.",
    code: 'BILLING_DISABLED',
  },
};

// Stripe calls this directly, so it can't sit behind login. The signature
// check (against the raw request body, wired up in app.js) is what proves
// the call really came from Stripe.
router.post('/webhook', asyncHandler(async (req, res) => {
  if (!isBillingEnabled()) return res.status(503).json(DISABLED_MESSAGE);

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return res.status(400).json({ error: { message: 'Invalid signature', code: 'INVALID_SIGNATURE' } });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.client_reference_id) {
      await pool.query(
        `UPDATE users SET plan_tier = 'premium', stripe_customer_id = $2 WHERE id = $1`,
        [session.client_reference_id, session.customer ?? null]
      );
    }
  } else if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    await pool.query(`UPDATE users SET plan_tier = 'free' WHERE stripe_customer_id = $1`, [
      subscription.customer,
    ]);
  }

  res.json({ received: true });
}));

router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT plan_tier FROM users WHERE id = $1', [req.userId]);
  res.json({ enabled: isBillingEnabled(), planTier: rows[0]?.plan_tier ?? 'free' });
}));

router.post('/checkout', asyncHandler(async (req, res) => {
  if (!isBillingEnabled()) return res.status(503).json(DISABLED_MESSAGE);

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    client_reference_id: req.userId,
    success_url: `${appUrl}/more?upgraded=1`,
    cancel_url: `${appUrl}/more`,
  });

  res.json({ url: session.url });
}));

export default router;
