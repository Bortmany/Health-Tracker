import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  checkWebhookSignature,
  createCheckoutUrl,
  isBillingEnabled,
  paddleConfig,
  planIntentFor,
  readWebhookEvent,
} from '../lib/billing.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const DISABLED_MESSAGE = {
  error: {
    message: "Upgrades aren't switched on yet. Premium is coming soon.",
    code: 'BILLING_DISABLED',
  },
};

// The payment provider calls this directly, so it can't sit behind login. The
// signature check — done against the raw request bytes, which is why this path
// skips JSON parsing in app.js — is what proves the call really came from
// Paddle and not from somebody who guessed the address.
router.post('/webhook', asyncHandler(async (req, res) => {
  const config = paddleConfig();
  if (!config) return res.status(503).json(DISABLED_MESSAGE);

  // express.raw gives us a Buffer here; the signature is over those exact bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
  const verdict = checkWebhookSignature(
    rawBody,
    req.headers['paddle-signature'],
    config.webhookSecret
  );

  if (verdict !== 'ok') {
    logger.warn('Rejected a payment webhook', { verdict });
    return res.status(400).json({
      error: { message: 'Invalid signature', code: 'INVALID_SIGNATURE' },
    });
  }

  const event = readWebhookEvent(rawBody);
  if (!event) {
    logger.warn('Could not read a payment webhook');
    return res.status(400).json({
      error: { message: 'That message could not be read.', code: 'INVALID_WEBHOOK' },
    });
  }

  const intent = planIntentFor(event);

  if (intent === 'activate') {
    if (event.userId) {
      // The account id travelled with the checkout in custom_data, so we know
      // exactly whose plan to move. The customer reference is stored so a later
      // message — a renewal or a cancellation, which only name the customer —
      // finds the same account.
      await pool.query(
        `UPDATE users SET plan_tier = 'premium', paddle_customer_id = $2 WHERE id = $1::uuid`,
        [event.userId, event.customerId]
      );
    } else if (event.customerId) {
      // A renewal that didn't repeat the account id: match on the customer
      // reference saved when the subscription first started.
      await pool.query(`UPDATE users SET plan_tier = 'premium' WHERE paddle_customer_id = $1`, [
        event.customerId,
      ]);
    }
  } else if (intent === 'deactivate') {
    if (event.userId) {
      await pool.query(`UPDATE users SET plan_tier = 'free' WHERE id = $1::uuid`, [event.userId]);
    } else if (event.customerId) {
      await pool.query(`UPDATE users SET plan_tier = 'free' WHERE paddle_customer_id = $1`, [
        event.customerId,
      ]);
    }
  }

  // Anything else (a payment retry, an event we don't act on) is accepted
  // quietly: answering anything but 200 makes Paddle retry it for days.
  res.json({ received: true });
}));

router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT plan_tier FROM users WHERE id = $1', [req.userId]);
  res.json({ enabled: isBillingEnabled(), planTier: rows[0]?.plan_tier ?? 'free' });
}));

router.post('/checkout', asyncHandler(async (req, res) => {
  const config = paddleConfig();
  if (!config) return res.status(503).json(DISABLED_MESSAGE);

  const url = await createCheckoutUrl(config, {
    userId: req.userId,
    successUrl: `${config.appUrl}/more?upgraded=1`,
  });

  if (!url) {
    return res.status(502).json({
      error: {
        message: "We couldn't open the payment page. Please try again in a moment.",
        code: 'CHECKOUT_UNAVAILABLE',
      },
    });
  }

  res.json({ url });
}));

export default router;
