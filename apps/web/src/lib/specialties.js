// The fixed list of coach specialties. The server stores the short code on
// the left; people only ever see the plain words on the right. Order here is
// the order chips appear everywhere (editor, directory filter, public page).
export const SPECIALTIES = [
  { code: 'fat-loss', label: 'Fat loss' },
  { code: 'muscle-gain', label: 'Muscle gain' },
  { code: 'beginners', label: 'Beginners' },
  { code: 'strength', label: 'Strength' },
  { code: 'running', label: 'Running' },
  { code: 'injury-safe', label: 'Injury-safe' },
  { code: 'nutrition', label: 'Nutrition' },
  { code: 'womens-training', label: "Women's training" },
  { code: 'over-40', label: 'Over 40' },
  { code: 'online-only', label: 'Online only' },
];

const LABELS = Object.fromEntries(SPECIALTIES.map((s) => [s.code, s.label]));

// Plain words for a code; falls back to the code itself so an unknown value
// from the server still shows something rather than nothing.
export function specialtyLabel(code) {
  return LABELS[code] ?? code;
}
