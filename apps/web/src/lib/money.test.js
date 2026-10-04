import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  centsToInput,
  coachKeepsCents,
  commissionPercent,
  commissionPercentFor,
  cutCents,
  formatCents,
  formatCentsShort,
  formatDay,
  formatDayShort,
  formatDollars,
  formatMoment,
  parsePriceInput,
} from './money.js';

test('cents become dollars with two decimals', () => {
  assert.equal(formatCents(1299), '$12.99');
  assert.equal(formatCents(0), '$0.00');
  assert.equal(formatCents(5), '$0.05');
  assert.equal(formatCents(41250), '$412.50');
});

test('a negative balance keeps its minus sign', () => {
  assert.equal(formatCents(-1200), '-$12.00');
  assert.equal(formatCents(-0.4), '$0.00');
});

test('a missing or broken amount shows a dash, never NaN', () => {
  for (const bad of [undefined, null, 'abc', Number.NaN, Infinity, {}]) {
    assert.equal(formatCents(bad), '—');
    assert.equal(formatCentsShort(bad), '—');
  }
  assert.equal(formatDollars(undefined), '—');
});

test('short prices drop .00 only', () => {
  assert.equal(formatCentsShort(3000), '$30');
  assert.equal(formatCentsShort(3050), '$30.50');
  assert.equal(formatCentsShort(-1200), '-$12');
  assert.equal(formatDollars(49), '$49');
});

test('Cut keeps 15%, or 10% from 20 paying students', () => {
  assert.equal(commissionPercentFor(0), 15);
  assert.equal(commissionPercentFor(19), 15);
  assert.equal(commissionPercentFor(20), 10);
  assert.equal(commissionPercentFor(undefined), 15);
  assert.equal(commissionPercent(10, 0), 10);
  assert.equal(commissionPercent(99, 25), 10);
  assert.equal(commissionPercent(undefined, 3), 15);
});

test('the commission split rounds half-up in whole cents', () => {
  assert.equal(cutCents(3000, 15), 450);
  assert.equal(coachKeepsCents(3000, 15), 2550);
  assert.equal(cutCents(1001, 15), 150);
  assert.equal(cutCents(1004, 15), 151);
  assert.equal(cutCents(5, 10), 1);
  assert.equal(cutCents(1, 10), 0);
  assert.equal(coachKeepsCents(3000, 10), 2700);
  assert.equal(coachKeepsCents(undefined, 15), null);
  assert.equal(coachKeepsCents(10.5, 15), null);
});

test('price box: empty, not a number, too low, too high, fine', () => {
  assert.deepEqual(parsePriceInput(''), { cents: null, error: 'empty' });
  assert.deepEqual(parsePriceInput('   '), { cents: null, error: 'empty' });
  assert.equal(parsePriceInput('abc').error, 'nan');
  assert.equal(parsePriceInput('$30').error, 'nan');
  assert.equal(parsePriceInput('-5').error, 'nan');
  assert.equal(parsePriceInput('30.').error, 'nan');
  assert.equal(parsePriceInput('1e3').error, 'nan');
  assert.equal(parsePriceInput('9.99').error, 'low');
  assert.equal(parsePriceInput('500.01').error, 'high');
  assert.deepEqual(parsePriceInput('10'), { cents: 1000, error: null });
  assert.deepEqual(parsePriceInput('500'), { cents: 50000, error: null });
  assert.deepEqual(parsePriceInput('30.5'), { cents: 3050, error: null });
  assert.deepEqual(parsePriceInput('25.05'), { cents: 2505, error: null });
});

test('price box limits can come from the server', () => {
  assert.equal(parsePriceInput('15', 2000, 50000).error, 'low');
});

test('cents go back into the price box as plain text', () => {
  assert.equal(centsToInput(3000), '30');
  assert.equal(centsToInput(3050), '30.5');
  assert.equal(centsToInput(3005), '30.05');
  assert.equal(centsToInput(null), '');
  assert.equal(centsToInput(-1), '');
});

test('dates: bad values show a dash', () => {
  assert.equal(formatDay(undefined), '—');
  assert.equal(formatDay('not a date'), '—');
  assert.equal(formatDay('2026-02-30'), '—');
  assert.equal(formatDayShort(null), '—');
  assert.equal(formatMoment('nonsense'), '—');
  assert.equal(formatMoment(42), '—');
});

test('dates: a real calendar day keeps its day whatever the time zone', () => {
  assert.match(formatDay('2026-11-14'), /2026/);
  assert.match(formatDay('2026-11-14'), /14/);
  assert.match(formatDay('2026-11-14T00:00:00.000Z'), /14/);
  assert.match(formatDayShort('2026-11-14'), /14/);
  assert.match(formatMoment('2026-11-14T12:00:00Z'), /2026/);
});
