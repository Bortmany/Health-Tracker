// Money helpers for the billing screens. The server sends every amount as a
// whole number of cents (fields named *Cents); nothing here ever turns a bad
// value into "NaN" — it shows a dash instead.
import {
  COMMISSION_LOW_FROM_STUDENTS,
  COMMISSION_PERCENT,
  COMMISSION_PERCENT_LOW,
  CURRENCY_SYMBOL,
  STUDENT_PRICE_MAX,
  STUDENT_PRICE_MIN,
} from './pricing.js';
import { toCalendarDay } from './localDate.js';

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// 1299 -> "$12.99", -1200 -> "-$12.00", anything broken -> "—".
export function formatCents(cents) {
  if (!isNumber(cents)) return '—';
  const rounded = Math.round(cents);
  const text = `${CURRENCY_SYMBOL}${(Math.abs(rounded) / 100).toFixed(2)}`;
  return rounded < 0 ? `-${text}` : text;
}

// 3000 -> "$30", 3050 -> "$30.50". For short lines like "$30 a month".
export function formatCentsShort(cents) {
  if (!isNumber(cents)) return '—';
  const rounded = Math.round(cents);
  if (rounded % 100 === 0) return formatCents(rounded).replace('.00', '');
  return formatCents(rounded);
}

// Whole dollars as a short price: 49 -> "$49".
export function formatDollars(dollars) {
  return isNumber(dollars) ? formatCentsShort(dollars * 100) : '—';
}

// 15%, or 10% once a coach has 20+ paying students.
export function commissionPercentFor(payingStudents) {
  return isNumber(payingStudents) && payingStudents >= COMMISSION_LOW_FROM_STUDENTS
    ? COMMISSION_PERCENT_LOW
    : COMMISSION_PERCENT;
}

// The rate to show: the one the server sent when it is a sensible number,
// otherwise worked out from the paying-student count.
export function commissionPercent(serverRate, payingStudents) {
  if (serverRate === COMMISSION_PERCENT || serverRate === COMMISSION_PERCENT_LOW) return serverRate;
  return commissionPercentFor(payingStudents);
}

// Cut's share of a payment in whole cents, rounded half-up (same rule as the
// server). Null when the inputs aren't usable.
export function cutCents(priceCents, ratePercent) {
  if (!Number.isInteger(priceCents) || priceCents < 0 || !isNumber(ratePercent)) return null;
  return Math.floor((priceCents * ratePercent + 50) / 100);
}

// What the coach keeps of a payment, in cents. Null when unusable.
export function coachKeepsCents(priceCents, ratePercent) {
  const cut = cutCents(priceCents, ratePercent);
  return cut == null ? null : priceCents - cut;
}

// What a coach typed into the price box (dollars), checked against the floor
// and cap (in cents). Returns { cents, error } where error is one of
// 'empty' | 'nan' | 'low' | 'high' | null. Whole dollars or up to two decimals.
export function parsePriceInput(text, minCents = STUDENT_PRICE_MIN * 100, maxCents = STUDENT_PRICE_MAX * 100) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed === '') return { cents: null, error: 'empty' };
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return { cents: null, error: 'nan' };
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || 0);
  if (cents < minCents) return { cents, error: 'low' };
  if (cents > maxCents) return { cents, error: 'high' };
  return { cents, error: null };
}

// Cents back into the text a person edits: 3000 -> "30", 3050 -> "30.5".
export function centsToInput(cents) {
  if (!Number.isInteger(cents) || cents < 0) return '';
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  if (rest === 0) return String(whole);
  return `${whole}.${String(rest).padStart(2, '0')}`.replace(/0$/, '');
}

// '2026-11-14' -> "14 Nov 2026" (device language). Anything that isn't a real
// day -> "—". Accepts a full timestamp too (keeps its date part).
export function formatDay(value) {
  const day = toCalendarDay(value);
  if (!day) return '—';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// "14 Nov" with no year, for the little "Ends 14 Nov" pill.
export function formatDayShort(value) {
  const day = toCalendarDay(value);
  if (!day) return '—';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// A moment (ISO timestamp) shown as its day on this device. Bad -> "—".
export function formatMoment(value) {
  if (typeof value !== 'string') return '—';
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return '—';
  return when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
