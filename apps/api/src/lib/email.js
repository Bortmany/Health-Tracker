// Sending email (password-reset messages). The only file that knows the email
// service (Resend), called with plain fetch.
//
// Dormant until RESEND_API_KEY and EMAIL_FROM are both set: isEmailEnabled() is
// false and screens say "coming soon". Even when configured, nothing is really
// sent outside production (NODE_ENV=production): in development and tests the
// message is kept in memory so a test can read it, and only its subject is
// logged — never the body, because the body holds the reset link.
//
// sendEmail never throws and never reveals why it failed to a caller who might
// pass that on to a visitor: "does this email address exist?" must not be
// answerable from the reply or its timing.

import { logger } from './logger.js';

const RESEND_URL = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CAPTURED = 200;

let captured = [];

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// True when the owner has set both email variables.
export function isEmailEnabled(env = process.env) {
  return text(env.RESEND_API_KEY) !== '' && text(env.EMAIL_FROM) !== '';
}

function isProduction(env) {
  return env.NODE_ENV === 'production';
}

// Messages kept in memory instead of being sent (development and tests only).
export function getCapturedEmails() {
  return captured.map((message) => ({ ...message }));
}

export function clearCapturedEmails() {
  captured = [];
}

function looksLikeEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value);
}

// Sends one plain-text email. Returns { sent, captured, reason? } and never
// throws. `sent` means handed to the email service; `captured` means kept in
// memory instead (development/tests).
export async function sendEmail({ to, subject, text: body } = {}, options = {}) {
  const env = options.env ?? process.env;
  const doFetch = options.fetch ?? ((...args) => globalThis.fetch(...args));

  if (!looksLikeEmail(to)) return { sent: false, captured: false, reason: 'bad_address' };
  if (typeof subject !== 'string' || subject.length === 0 || /[\r\n]/.test(subject) || subject.length > 200) {
    return { sent: false, captured: false, reason: 'bad_subject' };
  }
  if (typeof body !== 'string' || body.length === 0 || body.length > 20_000) {
    return { sent: false, captured: false, reason: 'bad_body' };
  }

  const reallySend = isEmailEnabled(env) && isProduction(env);

  if (!reallySend) {
    if (isProduction(env)) {
      // Production with no keys: dormant. Nothing is kept or sent.
      return { sent: false, captured: false, reason: 'dormant' };
    }
    captured.push({ to, subject, text: body, at: new Date().toISOString() });
    if (captured.length > MAX_CAPTURED) captured = captured.slice(-MAX_CAPTURED);
    // The subject only — the body's links and tokens never reach a log.
    logger.info('Email captured (not sent)', { subject });
    return { sent: false, captured: true };
  }

  try {
    const response = await doFetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${text(env.RESEND_API_KEY)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ from: text(env.EMAIL_FROM), to: [to], subject, text: body }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'manual',
    });
    if (!response.ok) {
      logger.warn('The email service refused a message', { status: response.status });
      return { sent: false, captured: false, reason: 'failed' };
    }
    return { sent: true, captured: false };
  } catch {
    logger.warn('Could not reach the email service');
    return { sent: false, captured: false, reason: 'failed' };
  }
}
