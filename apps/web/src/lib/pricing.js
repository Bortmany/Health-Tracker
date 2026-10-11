// The one place the Premium prices live. Every screen and policy page that
// shows a price reads it from here, so a price change is a one-line edit.
// Checkout itself uses the plan set up with the payment partner — keep the two in step.
export const PRICE_MONTHLY = 12.99;
export const PRICE_YEARLY = 89.99;
export const CURRENCY_SYMBOL = '$';

// Coach billing numbers (whole dollars / whole percents). Every sentence that
// quotes one reads it from here, so a change is a one-line edit.
export const COACH_STARTUP_FEE = 49;
export const STUDENT_PRICE_MIN = 10;
export const STUDENT_PRICE_MAX = 500;
export const COMMISSION_PERCENT = 15;
export const COMMISSION_PERCENT_LOW = 10;
export const COMMISSION_LOW_FROM_STUDENTS = 20;
export const EXAMPLE_STUDENT_PRICE = 30;

// 12.99 -> "$12.99". Whole amounts still show cents ("$90.00") so the two
// prices always read alike.
export function formatPrice(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return '—';
  return `${CURRENCY_SYMBOL}${amount.toFixed(2)}`;
}

// "$12.99 a month or $89.99 a year"
export function priceLine(monthly = PRICE_MONTHLY, yearly = PRICE_YEARLY) {
  return `${formatPrice(monthly)} a month or ${formatPrice(yearly)} a year`;
}

// ---- The upgrade card's two price lines ----
// Everything below is worked out from the two prices above, so changing a
// price updates "per month" and "Save %" by itself.

// What the yearly price comes to per month (89.99 / 12 -> 7.4991...), or NaN.
export function yearlyPerMonth(yearly = PRICE_YEARLY) {
  if (typeof yearly !== 'number' || !Number.isFinite(yearly) || yearly < 0) return Number.NaN;
  return yearly / 12;
}

// How much cheaper yearly is than 12 monthly payments, as a whole percent
// rounded down (so we never over-promise), or null when there's no saving
// or a price is broken — the card then just leaves the chip off.
export function yearlySavingsPercent(monthly = PRICE_MONTHLY, yearly = PRICE_YEARLY) {
  const perMonth = yearlyPerMonth(yearly);
  if (typeof monthly !== 'number' || !Number.isFinite(monthly) || monthly <= 0 || !Number.isFinite(perMonth)) {
    return null;
  }
  const percent = Math.floor((1 - perMonth / monthly) * 100);
  return percent > 0 ? percent : null;
}

// "$12.99 a month"
export function monthlyPriceLabel(monthly = PRICE_MONTHLY) {
  return `${formatPrice(monthly)} a month`;
}

// "$7.50/mo, billed $89.99 yearly"
export function yearlyPriceLabel(yearly = PRICE_YEARLY) {
  return `${formatPrice(yearlyPerMonth(yearly))}/mo, billed ${formatPrice(yearly)} yearly`;
}

// "Save 42%", or null when there's nothing to save.
export function savingsChipLabel(monthly = PRICE_MONTHLY, yearly = PRICE_YEARLY) {
  const percent = yearlySavingsPercent(monthly, yearly);
  return percent == null ? null : `Save ${percent}%`;
}
