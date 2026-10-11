// The fixed list of coach specialties. The server stores the short code on
// the left; people only ever see the plain words on the right. Order here is
// the order chips appear everywhere (editor, directory filter, public page).
// A `retired` entry keeps its words so an older saved profile never breaks,
// but it is never offered as a choice, a filter, or a chip.
const ALL_SPECIALTIES = [
  { code: 'fat-loss', label: 'Fat loss' },
  { code: 'muscle-gain', label: 'Muscle gain' },
  { code: 'beginners', label: 'Beginners' },
  { code: 'strength', label: 'Strength' },
  { code: 'running', label: 'Running' },
  { code: 'injury-safe', label: 'Injury-safe' },
  { code: 'nutrition', label: 'Nutrition', retired: true },
  { code: 'womens-training', label: "Women's training" },
  { code: 'over-40', label: 'Over 40' },
  { code: 'online-only', label: 'Online only' },
];

// The specialties people can pick or filter by.
export const SPECIALTIES = ALL_SPECIALTIES.filter((s) => !s.retired);

const RETIRED = new Set(ALL_SPECIALTIES.filter((s) => s.retired).map((s) => s.code));

// The codes worth showing as chips: drops retired ones, keeps the order given.
export function visibleSpecialties(codes) {
  return (codes ?? []).filter((code) => !RETIRED.has(code));
}

// True when at least one picked code is a real, showable specialty. A profile
// whose only saved code is retired counts as having none, so the editor
// prompts the coach to pick a current one.
export function hasVisibleSpecialty(codes) {
  return visibleSpecialties(codes).length > 0;
}

const LABELS = Object.fromEntries(ALL_SPECIALTIES.map((s) => [s.code, s.label]));

// Plain words for a code; falls back to the code itself so an unknown value
// from the server still shows something rather than nothing.
export function specialtyLabel(code) {
  return LABELS[code] ?? code;
}
