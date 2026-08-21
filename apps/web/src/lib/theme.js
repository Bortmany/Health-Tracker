// Read a design token (CSS custom property) off the document root,
// e.g. readToken('--color-accent') → '#c8f135'. Used by anything that
// needs a token value in JavaScript, like Chart.js colors.
// The answer depends on the light/dark theme in force right now, so call
// this when the value is used — never store the result for later.
export function readToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
