// Plain rules for the weight box on the Log screen. No React here, so each
// rule has a small test next to it (weight.test.js). The server checks the
// same range again (apps/api): the screen copy is for speed and friendliness.

export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 400;
export const WEIGHT_RANGE_MESSAGE = `Weight should be between ${WEIGHT_MIN_KG} and ${WEIGHT_MAX_KG} kg.`;

// True when the box holds nothing, or only spaces.
export function isBlankWeight(value) {
  return value == null || String(value).trim() === '';
}

// What to send: null for a blank box (never 0), otherwise the number
// (NaN if it isn't one, which weightError catches first).
export function weightToPayload(value) {
  return isBlankWeight(value) ? null : Number(String(value).trim());
}

// The plain line to show when the weight can't be saved, or null when it's
// fine. A blank box is fine: it just means "no weigh-in today".
export function weightError(value) {
  if (isBlankWeight(value)) return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n < WEIGHT_MIN_KG || n > WEIGHT_MAX_KG) return WEIGHT_RANGE_MESSAGE;
  return null;
}

// Server wording that would otherwise reach the screen raw, said plainly.
const SERVER_TEXT = [
  [/weight cannot be negative/i, WEIGHT_RANGE_MESSAGE],
  [/displayName must be at least 1 character/i, 'Please enter a name.'],
];

export function plainServerMessage(message) {
  const text = typeof message === 'string' ? message : '';
  for (const [pattern, plain] of SERVER_TEXT) if (pattern.test(text)) return plain;
  return text || 'Something went wrong. Please try again.';
}
