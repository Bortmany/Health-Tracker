// Picks only the aria-* attributes out of a component's extra props, so the
// shared primitives can pass accessibility hints through without letting a
// stray prop change how they behave.
export function ariaProps(props) {
  const out = {};
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('aria-')) out[key] = value;
  }
  return out;
}
