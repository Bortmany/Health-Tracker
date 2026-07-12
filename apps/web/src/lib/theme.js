// Read a design token (CSS custom property) off the document root,
// e.g. readToken('--color-accent') → '#c8f135'. Used by anything that
// needs a token value in JavaScript, like Chart.js colors.
export function readToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
