import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeCommission,
  isValidPriceCents,
  rateBpsFor,
  reverseCommission,
  splitAtRate,
} from './commission.js';

test('15% for fewer than 20 paying students, 10% from 20', () => {
  assert.equal(rateBpsFor(0), 1500);
  assert.equal(rateBpsFor(19), 1500);
  assert.equal(rateBpsFor(20), 1000);
  assert.equal(rateBpsFor(35), 1000);
});

test('the spec example: $30 pays the coach $25.50 and Cut $4.50', () => {
  const split = computeCommission(3000, 1);
  assert.deepEqual(split, { grossCents: 3000, commissionCents: 450, coachCents: 2550, rateBps: 1500 });
});

test('the lower rate applies at 20 students', () => {
  const split = computeCommission(3000, 20);
  assert.equal(split.commissionCents, 300);
  assert.equal(split.coachCents, 2700);
  assert.equal(split.rateBps, 1000);
});

test('a half cent rounds UP in Cut\'s favour, and the two parts always add to the gross', () => {
  // 1010 x 15% = 151.5 -> 152
  const a = splitAtRate(1010, 1500);
  assert.equal(a.commissionCents, 152);
  assert.equal(a.coachCents, 858);
  // 1030 x 15% = 154.5 -> 155
  assert.equal(splitAtRate(1030, 1500).commissionCents, 155);
  // 1005 x 10% = 100.5 -> 101
  assert.equal(splitAtRate(1005, 1000).commissionCents, 101);
  // Just under a half stays down: 1003 x 15% = 150.45 -> 150
  assert.equal(splitAtRate(1003, 1500).commissionCents, 150);
  for (let gross = 1000; gross <= 1200; gross += 1) {
    for (const bps of [1000, 1500]) {
      const s = splitAtRate(gross, bps);
      assert.equal(s.commissionCents + s.coachCents, gross);
    }
  }
});

test('zero gross is fine; bad inputs throw instead of guessing', () => {
  assert.deepEqual(splitAtRate(0, 1500), { grossCents: 0, commissionCents: 0, coachCents: 0, rateBps: 1500 });
  assert.throws(() => splitAtRate(10.5, 1500), TypeError);
  assert.throws(() => splitAtRate(-1, 1500), RangeError);
  assert.throws(() => splitAtRate(1000, 20000), RangeError);
  assert.throws(() => rateBpsFor('3'), TypeError);
  assert.throws(() => computeCommission(NaN, 1), TypeError);
});

test('a full refund reverses the original exactly; a partial one uses the stored rate', () => {
  const original = splitAtRate(1010, 1500); // commission 152
  const full = reverseCommission({
    originalGrossCents: 1010, originalCommissionCents: original.commissionCents, rateBps: 1500, refundCents: 1010,
  });
  assert.deepEqual(full, { grossCents: -1010, commissionCents: -152, coachCents: -858, rateBps: 1500 });

  const half = reverseCommission({
    originalGrossCents: 3000, originalCommissionCents: 450, rateBps: 1500, refundCents: 1500,
  });
  assert.deepEqual(half, { grossCents: -1500, commissionCents: -225, coachCents: -1275, rateBps: 1500 });

  // More than was paid is capped at the original.
  const over = reverseCommission({
    originalGrossCents: 3000, originalCommissionCents: 450, rateBps: 1500, refundCents: 9999,
  });
  assert.equal(over.grossCents, -3000);
});

test('prices: $10 to $500 in whole cents', () => {
  assert.equal(isValidPriceCents(1000), true);
  assert.equal(isValidPriceCents(50000), true);
  assert.equal(isValidPriceCents(999), false);
  assert.equal(isValidPriceCents(50001), false);
  assert.equal(isValidPriceCents(1500.5), false);
  assert.equal(isValidPriceCents('3000'), false);
  assert.equal(isValidPriceCents(null), false);
});
