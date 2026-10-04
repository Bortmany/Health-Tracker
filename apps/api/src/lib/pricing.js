// The one place the server's money numbers live — all in whole cents (USD), so
// no calculation here ever touches a fractional dollar. The screens keep their
// own dollar copy in apps/web/src/lib/pricing.js; keep the two in step.
//
// Nothing here names a payment provider. The provider's own plan ids (which
// checkout page sells which product) live in the billing folder's settings.

// What a coach pays once, before they can take paying students.
export const coachStartupFeeCents = 4900;

// The solo AI plan.
export const aiMonthlyCents = 1299;
export const aiYearlyCents = 8999;

// The range a coach may charge a student each month (server-enforced).
export const coachMinPriceCents = 1000;
export const coachMaxPriceCents = 50000;

// Cut's cut of every student payment: 15%, dropping to 10% once the coach has
// 20 or more paying students at the moment of the payment.
export const commissionPercent = 15;
export const reducedCommissionPercent = 10;
export const reducedCommissionFromStudents = 20;

// Which percentage applies, given how many paying students the coach has.
export function commissionPercentFor(payingStudents) {
  const count = Number.isInteger(payingStudents) && payingStudents > 0 ? payingStudents : 0;
  return count >= reducedCommissionFromStudents ? reducedCommissionPercent : commissionPercent;
}

// Cut's commission on a payment, in whole cents, rounded half-up. Whole-number
// maths only: (gross x percent + 50) / 100, rounded down. The coach's share is
// always gross minus this, so the two always add back to the payment exactly.
export function commissionCents(grossCents, percent) {
  if (!Number.isInteger(grossCents) || !Number.isInteger(percent) || percent < 0) return 0;
  const sign = grossCents < 0 ? -1 : 1;
  const magnitude = Math.abs(grossCents);
  return sign * Math.floor((magnitude * percent + 50) / 100);
}
