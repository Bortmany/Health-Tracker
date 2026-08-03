// Small, dependency-free input validators for the Express routes.
//
// Every check throws a ValidationError carrying the app's standard error shape
// ({ error: { message, code } }) and an HTTP 400. The central error handler in
// app.js recognises these (they set `status` + `body`) and returns them as a
// clean 400 instead of a generic 500 — so a route can just call a validator and
// let a bad value short-circuit with a plain-English message.

export class ValidationError extends Error {
  constructor(message, code = 'INVALID_INPUT') {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.code = code;
    // Ready-to-send response body in the shape every route uses.
    this.body = { error: { message, code } };
  }
}

// A finite, non-negative number, optionally bounded and/or whole.
// Pass { optional: true } to allow null/undefined/'' — returns null in that case.
export function nonNegativeNumber(value, name, { max = Number.MAX_SAFE_INTEGER, integer = false, optional = false } = {}) {
  if (value == null || value === '') {
    if (optional) return null;
    throw new ValidationError(`${name} is required`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new ValidationError(`${name} must be a number`);
  }
  if (integer && !Number.isInteger(n)) {
    throw new ValidationError(`${name} must be a whole number`);
  }
  if (n < 0) {
    throw new ValidationError(`${name} cannot be negative`);
  }
  if (n > max) {
    throw new ValidationError(`${name} must be no more than ${max}`);
  }
  return n;
}

// A trimmed string within a length range.
// Pass { optional: true } to allow null/undefined/'' — returns null in that case.
export function stringLength(value, name, { min = 1, max = 255, optional = false } = {}) {
  if (value == null || value === '') {
    if (optional) return null;
    throw new ValidationError(`${name} is required`);
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${name} must be text`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new ValidationError(`${name} must be at least ${min} character${min === 1 ? '' : 's'} long`);
  }
  if (trimmed.length > max) {
    throw new ValidationError(`${name} must be no more than ${max} characters long`);
  }
  return trimmed;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A real calendar date in YYYY-MM-DD form (rejects e.g. 2026-13-40).
export function isoDate(value, name = 'date') {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new ValidationError(`${name} must be a date in YYYY-MM-DD format`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`${name} must be a real date`);
  }
  return value;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A quick shape check for an id. Used to turn a malformed :id in the URL into a
// clean "not found" instead of letting Postgres throw a cast error (a 500).
export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

// An id supplied in a request body (e.g. which program a session belongs to).
// Pass { optional: true } to allow null/undefined/'' — returns null in that case.
// A wrongly-shaped id is rejected with a clean 400 instead of a database error.
export function uuid(value, name = 'id', { optional = false } = {}) {
  if (value == null || value === '') {
    if (optional) return null;
    throw new ValidationError(`${name} is required`);
  }
  if (!isUuid(value)) {
    throw new ValidationError(`${name} must be a valid id`);
  }
  return value;
}

// An address must have something before the @, a domain, and end in a real
// dot-ending (2+ letters). Deliberately a shape check and NOT a list of
// allowed providers — work addresses on any domain have to keep working.
// The browser side checks the same shape in apps/web/src/lib/validation.js;
// keep the two in step.
export const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

// A syntactically valid email address; returns it trimmed and lower-cased.
export function email(value, name = 'email') {
  if (typeof value !== 'string' || !EMAIL_RE.test(value.trim())) {
    throw new ValidationError(`${name} must be a valid email address, like JohnDoe@gmail.com`);
  }
  return value.trim().toLowerCase();
}
