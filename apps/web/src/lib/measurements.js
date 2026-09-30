// Plain rules for body measurements (cm): the fields, their sensible ranges,
// the chart series and its caption. No React here, so each rule has a small
// test next to it (measurements.test.js).

import { daysBetween, formatShortDay, localToday, toCalendarDay } from './localDate.js';

// In the order the Log screen and the chart chips show them. Waist keeps
// whatever check it had before (none on this screen), so it has no range.
// The ranges match the server's own (a neck of 999 is refused there too).
export const MEASUREMENTS = [
  { key: 'waist', label: 'Waist', placeholder: '84' },
  { key: 'chest', label: 'Chest', placeholder: '98', min: 30, max: 250 },
  { key: 'arms', label: 'Arms', placeholder: '34', min: 10, max: 100 },
  { key: 'hips', label: 'Hips', placeholder: '100', min: 30, max: 250 },
  { key: 'thighs', label: 'Thighs', placeholder: '58', min: 20, max: 150 },
  { key: 'neck', label: 'Neck', placeholder: '38', min: 15, max: 80 },
];

export const MEASUREMENT_KEYS = MEASUREMENTS.map((m) => m.key);

function findMeasurement(key) {
  return MEASUREMENTS.find((m) => m.key === key) ?? null;
}

// The plain line under a box that's out of range ("Chest should be between
// 30 and 250 cm."), or null when it's fine. Blank is always fine.
export function rangeError(key, value) {
  const m = findMeasurement(key);
  if (!m || m.min == null) return null;
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < m.min || n > m.max) {
    return `${m.label} should be between ${m.min} and ${m.max} cm.`;
  }
  return null;
}

// Every out-of-range box in a form, as { key: message }.
export function rangeErrors(form) {
  const out = {};
  for (const key of MEASUREMENT_KEYS) {
    const message = rangeError(key, form?.[key]);
    if (message) out[key] = message;
  }
  return out;
}

// The form's boxes as the numbers the server expects ('' becomes null).
export function measurementPayload(form) {
  const out = {};
  for (const key of MEASUREMENT_KEYS) {
    const value = form?.[key];
    out[key] = value === '' || value == null ? null : Number(value);
  }
  return out;
}

// One measurement's entries, oldest first, skipping days without it and any
// day the screen can't read.
export function seriesFor(measurements, key) {
  if (!Array.isArray(measurements)) return [];
  const out = [];
  for (const row of measurements) {
    const day = toCalendarDay(row?.date);
    const value = row?.[key];
    if (!day || value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) out.push({ date: day, value: n });
  }
  return out;
}

// The chip picked first: the first measurement with any entries, else Waist.
export function defaultMeasurement(measurements) {
  return MEASUREMENT_KEYS.find((key) => seriesFor(measurements, key).length > 0) ?? 'waist';
}

// "98 cm" (one decimal only when it has one).
export function formatCm(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${Number(n.toFixed(1))} cm`;
}

// A trend rate needs this much time and this many entries, so two readings
// a day apart never pretend to be a trend.
export const TREND_MIN_DAYS = 14;
export const TREND_MIN_ENTRIES = 4;

// The one line under the chart:
// - enough data: "Down about 0.5 cm a week" (or "Up ...", or "Holding steady");
// - exactly one entry: "First entry: 98 cm on 8 Sept.";
// - otherwise: "Add a few more over two weeks to see a trend."
// Null when there's nothing at all (the empty state shows instead).
export function measurementCaption(series, today = localToday()) {
  if (!Array.isArray(series) || series.length === 0) return null;
  const first = series[0];
  const last = series[series.length - 1];
  const span = daysBetween(first.date, last.date);
  if (span != null && span >= TREND_MIN_DAYS && series.length >= TREND_MIN_ENTRIES) {
    const perWeek = ((last.value - first.value) / span) * 7;
    const rounded = Math.abs(perWeek).toFixed(1);
    if (rounded === '0.0') return 'Holding steady';
    return `${perWeek < 0 ? 'Down' : 'Up'} about ${rounded} cm a week`;
  }
  if (series.length === 1) {
    return `First entry: ${formatCm(first.value)} on ${formatShortDay(first.date, today)}.`;
  }
  return 'Add a few more over two weeks to see a trend.';
}

// "No chest measurements yet. A tape measure and two minutes is all it takes."
export function emptyMeasurementText(key) {
  const label = (findMeasurement(key)?.label ?? 'body').toLowerCase();
  return `No ${label} measurements yet. A tape measure and two minutes is all it takes.`;
}
