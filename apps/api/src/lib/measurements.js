// Body measurements (cm) on the daily log: the ranges, the check, and the
// list the Progress screen and a linked coach read.

import { pool } from '../db/pool.js';
import { addDays } from './userToday.js';
import { ValidationError } from './validate.js';

// The same ranges as the database's own checks (migration 026).
export const MEASUREMENT_RANGES = {
  chest: { label: 'Chest', min: 30, max: 250 },
  arms: { label: 'Arms', min: 10, max: 100 },
  hips: { label: 'Hips', min: 30, max: 250 },
  thighs: { label: 'Thighs', min: 20, max: 150 },
  neck: { label: 'Neck', min: 15, max: 80 },
};

export const MEASUREMENT_FIELDS = Object.keys(MEASUREMENT_RANGES);

// One measurement: empty is fine (null); anything else must be a number in
// range, or a plain-English 400.
export function cleanMeasurement(value, field) {
  if (value == null || value === '') return null;
  const { label, min, max } = MEASUREMENT_RANGES[field];
  const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ValidationError(`${label} should be between ${min} and ${max} cm.`, 'VALIDATION_ERROR');
  }
  return n;
}

export function cleanMeasurements(body) {
  const out = {};
  for (const field of MEASUREMENT_FIELDS) out[field] = cleanMeasurement(body?.[field], field);
  return out;
}

const toNumber = (value) => (value == null ? null : Number(value));

// The five measurements from a daily_logs row, as numbers or null.
export function measurementsFromRow(row) {
  const out = {};
  for (const field of MEASUREMENT_FIELDS) out[field] = toNumber(row?.[field]);
  return out;
}

// ?days= : a whole number from 1 to 365, default 90.
export function cleanDays(value) {
  if (value == null || value === '') return 90;
  const n = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isInteger(n) || n < 1 || n > 365) {
    throw new ValidationError('days must be a whole number from 1 to 365', 'VALIDATION_ERROR');
  }
  return n;
}

// Days in the last `days` (counting today) with at least one measurement,
// oldest first.
export async function loadMeasurements(userId, today, days) {
  const from = addDays(today, -(days - 1));
  const { rows } = await pool.query(
    `SELECT date::text AS date, waist, chest, arms, hips, thighs, neck
     FROM daily_logs
     WHERE user_id = $1 AND date BETWEEN $2::date AND $3::date
       AND (waist IS NOT NULL OR chest IS NOT NULL OR arms IS NOT NULL
            OR hips IS NOT NULL OR thighs IS NOT NULL OR neck IS NOT NULL)
     ORDER BY date`,
    [userId, from, today]
  );
  return rows.map((row) => ({ date: row.date, waist: toNumber(row.waist), ...measurementsFromRow(row) }));
}
