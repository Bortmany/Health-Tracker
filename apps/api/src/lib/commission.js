// Cut's money rules as plain, side-effect-free maths (spec
// Agents/docs/specs/cut/coach-billing.md). Everything is whole cents and whole
// integers: no decimals ever touch money, so there is no drift to explain.

// One-off fee a coach pays before taking paying students.
export const STARTUP_FEE_CENTS = 4900;

// What a coach may charge a student each month.
export const MIN_PRICE_CENTS = 1000;
export const MAX_PRICE_CENTS = 50000;

// The solo AI plan's prices (kept equal to apps/web/src/lib/pricing.js).
export const AI_MONTHLY_CENTS = 1299;
export const AI_YEARLY_CENTS = 8999;

// Cut's cut, in basis points (1/100 of a percent): 1500 = 15%.
export const STANDARD_RATE_BPS = 1500;
export const REDUCED_RATE_BPS = 1000;
// A coach with this many paying students (or more) gets the lower rate.
export const REDUCED_RATE_THRESHOLD = 20;

function assertWholeCents(value, name) {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be a whole number of cents`);
  }
}

// 15% normally; 10% once the coach has 20 or more paying students AT THAT
// payment. The count is the number of students paying at the moment of the
// payment (including the one paying now).
export function rateBpsFor(payingStudentCount) {
  assertWholeCents(payingStudentCount, 'payingStudentCount');
  return payingStudentCount >= REDUCED_RATE_THRESHOLD ? REDUCED_RATE_BPS : STANDARD_RATE_BPS;
}

// Percent for display (15 or 10).
export function ratePercentFor(payingStudentCount) {
  return rateBpsFor(payingStudentCount) / 100;
}

// Splits a gross amount at a given rate. Cut's commission is gross x rate,
// rounded half-up to the cent (a half-cent goes up); the coach gets the
// remainder, so the two always add back to exactly the gross.
export function splitAtRate(grossCents, rateBps) {
  assertWholeCents(grossCents, 'grossCents');
  assertWholeCents(rateBps, 'rateBps');
  if (grossCents < 0) throw new RangeError('grossCents cannot be negative');
  if (rateBps < 0 || rateBps > 10000) throw new RangeError('rateBps must be between 0 and 10000');
  // Integer half-up: floor((gross * bps + 5000) / 10000).
  const commissionCents = Math.floor((grossCents * rateBps + 5000) / 10000);
  return { grossCents, commissionCents, coachCents: grossCents - commissionCents, rateBps };
}

// The normal case: pick the rate from the coach's paying-student count, then split.
export function computeCommission(grossCents, payingStudentCount) {
  return splitAtRate(grossCents, rateBpsFor(payingStudentCount));
}

// A refund or chargeback undoes part (or all) of an earlier payment at the
// ORIGINAL payment's stored rate. Returns negative numbers. Refunding the whole
// payment reverses it exactly, whatever the rounding was.
export function reverseCommission({ originalGrossCents, originalCommissionCents, rateBps, refundCents }) {
  assertWholeCents(originalGrossCents, 'originalGrossCents');
  assertWholeCents(originalCommissionCents, 'originalCommissionCents');
  assertWholeCents(refundCents, 'refundCents');
  const refund = Math.min(Math.max(refundCents, 0), originalGrossCents);
  if (refund === originalGrossCents) {
    return {
      grossCents: -originalGrossCents,
      commissionCents: -originalCommissionCents,
      coachCents: -(originalGrossCents - originalCommissionCents),
      rateBps,
    };
  }
  const part = splitAtRate(refund, rateBps);
  // Repeated partial refunds each round half-up, so they could add up to more
  // than the commission that was ever taken. Never reverse more than what is
  // left of the original commission (callers pass the REMAINING amounts).
  const commission = Math.min(part.commissionCents, Math.max(originalCommissionCents, 0));
  return {
    grossCents: -part.grossCents,
    commissionCents: -commission,
    coachCents: -(part.grossCents - commission),
    rateBps,
  };
}

// Is this a price a coach may set? (whole cents, $10 to $500)
export function isValidPriceCents(value) {
  return Number.isSafeInteger(value) && value >= MIN_PRICE_CENTS && value <= MAX_PRICE_CENTS;
}
