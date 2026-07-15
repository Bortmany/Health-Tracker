// Sentry error tracking — completely dormant until SENTRY_DSN is set.
//
// With no SENTRY_DSN the whole thing is inert: nothing is imported, nothing is
// sent, captureException() is a no-op. When the owner sets SENTRY_DSN on
// Railway we lazily import @sentry/node (so the dependency is only needed once
// it's actually switched on) and start reporting server errors. If the SDK
// isn't installed or fails to start, we log a warning and carry on — the app
// never crashes because of error tracking.

import { logger } from './logger.js';

let sentry = null;

export async function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // dormant — no DSN configured
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0,
    });
    sentry = Sentry;
    logger.info('Sentry error tracking enabled');
  } catch (err) {
    logger.warn('SENTRY_DSN is set but @sentry/node could not be loaded; error tracking stays off. Run: npm install @sentry/node', {
      message: err.message,
    });
  }
}

export function captureException(err) {
  if (!sentry) return;
  try {
    sentry.captureException(err);
  } catch {
    // Never let error reporting break the request path.
  }
}

export function isSentryEnabled() {
  return sentry != null;
}
