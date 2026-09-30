import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICE_MONTHLY,
  PRICE_YEARLY,
  formatPrice,
  monthlyPriceLabel,
  priceLine,
  savingsChipLabel,
  yearlyPerMonth,
  yearlyPriceLabel,
  yearlySavingsPercent,
} from './pricing.js';

test('the price line shows both prices with cents', () => {
  assert.equal(priceLine(), '$12.99 a month or $89.99 a year');
  assert.equal(PRICE_MONTHLY, 12.99);
  assert.equal(PRICE_YEARLY, 89.99);
});

test('whole amounts still show cents', () => {
  assert.equal(formatPrice(90), '$90.00');
});

test('a missing or broken amount shows a dash, never NaN', () => {
  assert.equal(formatPrice(undefined), '—');
  assert.equal(formatPrice(Number.NaN), '—');
  assert.equal(formatPrice(-1), '—');
  assert.equal(priceLine(Number.NaN, 89.99), '— a month or $89.99 a year');
});

test('the yearly price is shown per month, worked out from the constants', () => {
  assert.equal(yearlyPerMonth(), PRICE_YEARLY / 12);
  assert.equal(formatPrice(yearlyPerMonth()), '$7.50');
  assert.equal(yearlyPriceLabel(), '$7.50/mo, billed $89.99 yearly');
  assert.equal(monthlyPriceLabel(), '$12.99 a month');
});

test('the saving is worked out from the two prices and rounded down', () => {
  assert.equal(yearlySavingsPercent(), 42);
  assert.equal(savingsChipLabel(), 'Save 42%');
  // 10 a month vs 60 a year (5 a month) is exactly half.
  assert.equal(yearlySavingsPercent(10, 60), 50);
  // 10 a month vs 100 a year (8.33 a month) is 16.67% -> 16, never rounded up.
  assert.equal(yearlySavingsPercent(10, 100), 16);
});

test('no saving or a broken price leaves the chip off, never NaN', () => {
  assert.equal(yearlySavingsPercent(10, 120), null);
  assert.equal(yearlySavingsPercent(10, 150), null);
  assert.equal(yearlySavingsPercent(Number.NaN, 89.99), null);
  assert.equal(yearlySavingsPercent(12.99, -1), null);
  assert.equal(savingsChipLabel(0, 89.99), null);
  assert.equal(yearlyPriceLabel(Number.NaN), '—/mo, billed — yearly');
});
