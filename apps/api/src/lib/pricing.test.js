import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coachStartupFeeCents,
  aiMonthlyCents,
  aiYearlyCents,
  coachMinPriceCents,
  coachMaxPriceCents,
  commissionPercentFor,
  commissionCents,
} from './pricing.js';

test('the fixed prices are whole cents', () => {
  assert.equal(coachStartupFeeCents, 4900);
  assert.equal(aiMonthlyCents, 1299);
  assert.equal(aiYearlyCents, 8999);
  assert.equal(coachMinPriceCents, 1000);
  assert.equal(coachMaxPriceCents, 50000);
});

test('the rate drops from 15% to 10% at 20 paying students', () => {
  assert.equal(commissionPercentFor(0), 15);
  assert.equal(commissionPercentFor(19), 15);
  assert.equal(commissionPercentFor(20), 10);
  assert.equal(commissionPercentFor(200), 10);
  assert.equal(commissionPercentFor(-3), 15);
  assert.equal(commissionPercentFor(undefined), 15);
});

test('commission rounds half up and the two shares always add back up', () => {
  assert.equal(commissionCents(3000, 15), 450);
  assert.equal(commissionCents(1299, 15), 195); // 194.85 -> 195
  assert.equal(commissionCents(1000, 15), 150);
  assert.equal(commissionCents(1003, 15), 150); // 150.45 -> 150
  assert.equal(commissionCents(1010, 15), 152); // 151.5 -> 152 (half up)
  assert.equal(commissionCents(5, 10), 1); // 0.5 -> 1
  for (const gross of [1000, 1299, 2501, 49999, 50000]) {
    const commission = commissionCents(gross, 15);
    assert.equal(commission + (gross - commission), gross);
  }
});

test('a refund (negative gross) mirrors the original commission', () => {
  assert.equal(commissionCents(-3000, 15), -450);
  assert.equal(commissionCents(-1299, 15), -195);
});

test('bad input gives zero, never NaN', () => {
  assert.equal(commissionCents(12.5, 15), 0);
  assert.equal(commissionCents('100', 15), 0);
  assert.equal(commissionCents(100, -1), 0);
});
