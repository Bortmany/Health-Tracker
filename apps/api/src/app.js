import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db/pool.js';
import { verifyToken } from './lib/jwt.js';
import { logger } from './lib/logger.js';
import { captureException, initSentry } from './lib/sentry.js';
import activitiesRouter from './routes/activities.js';
import authRouter from './routes/auth.js';
import billingRouter from './routes/billing.js';
import coachRouter from './routes/coach.js';
import coachLinkRouter from './routes/coachLink.js';
import exercisesRouter from './routes/exercises.js';
import habitsRouter from './routes/habits.js';
import healthSyncRouter from './routes/healthSync.js';
import injuriesRouter from './routes/injuries.js';
import logsRouter from './routes/logs.js';
import nutritionRouter from './routes/nutrition.js';
import plansRouter from './routes/plans.js';
import programsRouter from './routes/programs.js';
import settingsRouter from './routes/settings.js';
import trainingLogsRouter from './routes/trainingLogs.js';

export const app = express();

// Railway (like most hosts) puts a proxy in front of the app. Trusting it means
// the rate limiter sees each visitor's real address instead of the proxy's.
app.set('trust proxy', 1);

// Content-Security-Policy: tells the browser exactly which sources it may load
// from, which blocks most injected-script attacks. These values are scoped to
// what the Cut frontend actually uses: its own scripts/styles (same origin),
// Google Fonts, and same-origin API calls. Stripe checkout is a full-page
// redirect (no embedded script), so it needs nothing extra here.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // React renders inline style="" attributes throughout, so 'unsafe-inline'
      // is required for styles (not for scripts). Google Fonts stylesheet host.
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(compression());
// Stripe's webhook signature is checked against the raw request bytes, so
// that one path must skip JSON parsing. It's registered before express.json.
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));

// Slow down password-guessing: 20 login/register attempts per 15 minutes per IP.
// Off outside production so local dev and the test suite aren't throttled.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { error: { message: 'Too many attempts. Please wait 15 minutes and try again.', code: 'RATE_LIMITED' } },
});
app.use('/api/auth', authLimiter);
// Invite codes get the same guessing protection as passwords.
app.use('/api/coach-link/redeem', authLimiter);

// Start Sentry error tracking if (and only if) SENTRY_DSN is configured.
// With no DSN this returns immediately and nothing is imported or sent.
initSentry();

// A second, gentler limiter for the everyday data-writing routes. It keys by the
// signed-in user when we can read their session cookie (so one user's activity
// can't use up another's budget), and falls back to the visitor's IP otherwise.
// Read-only GETs are skipped, and — like the auth limiter — the whole thing is
// off outside production so local dev and the test suite aren't throttled.
// `validate: false` turns off express-rate-limit's own IP-format checks so the
// custom key function is safe across library versions; the limits still apply.
function writeLimiterKey(req) {
  const token = req.cookies?.token;
  if (token) {
    try {
      return `user:${verifyToken(token)}`;
    } catch {
      // Not a valid session — fall through to limiting by IP.
    }
  }
  return `ip:${req.ip}`;
}

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: writeLimiterKey,
  skip: (req) => process.env.NODE_ENV !== 'production' || req.method === 'GET',
  message: { error: { message: 'You are saving changes too quickly. Please slow down and try again shortly.', code: 'RATE_LIMITED' } },
});
for (const path of ['/api/logs', '/api/nutrition', '/api/training-logs', '/api/programs', '/api/health-sync']) {
  app.use(path, writeLimiter);
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      db: 'connected',
      sentry: process.env.SENTRY_DSN ? 'configured' : 'dormant',
    });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', message: err.message });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/billing', billingRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/habits', habitsRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/coach', coachRouter);
app.use('/api/coach-link', coachLinkRouter);
app.use('/api/exercises', exercisesRouter);
app.use('/api/health-sync', healthSyncRouter);
app.use('/api/injuries', injuriesRouter);
app.use('/api/logs', logsRouter);
app.use('/api/nutrition', nutritionRouter);
app.use('/api/plans', plansRouter);
app.use('/api/programs', programsRouter);
app.use('/api/training-logs', trainingLogsRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
});

if (process.env.NODE_ENV === 'production') {
  const webDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  app.use(express.static(webDist, { index: false }));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use((err, req, res, _next) => {
  // Validation helpers throw an error that already carries a 400 and a
  // plain-English body — surface that to the client instead of a generic 500.
  if (err && err.status && err.body) {
    logger.warn('Request rejected', { method: req.method, path: req.path, code: err.code });
    return res.status(err.status).json(err.body);
  }
  // Anything else is a real server error: log it (secrets redacted) and, if
  // Sentry is switched on, report it — then return the standard shape.
  logger.error('Unhandled server error', { method: req.method, path: req.path, error: err });
  captureException(err);
  res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
});
