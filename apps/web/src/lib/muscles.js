// The 16 muscle groups the heatmap can color. The ids match what the
// API's /muscle-heatmap endpoint returns; the labels are what people see.
export const MUSCLES = [
  { id: 'chest', label: 'Chest' },
  { id: 'front-delts', label: 'Front shoulders' },
  { id: 'side-delts', label: 'Side shoulders' },
  { id: 'rear-delts', label: 'Rear shoulders' },
  { id: 'biceps', label: 'Biceps' },
  { id: 'triceps', label: 'Triceps' },
  { id: 'forearms', label: 'Forearms' },
  { id: 'traps', label: 'Traps' },
  { id: 'lats', label: 'Lats' },
  { id: 'lower-back', label: 'Lower back' },
  { id: 'abs', label: 'Abs' },
  { id: 'obliques', label: 'Obliques' },
  { id: 'glutes', label: 'Glutes' },
  { id: 'quads', label: 'Quads' },
  { id: 'hamstrings', label: 'Hamstrings' },
  { id: 'calves', label: 'Calves' },
];

// Quick id → label lookup, e.g. MUSCLE_LABELS['front-delts'] === 'Front shoulders'.
export const MUSCLE_LABELS = Object.fromEntries(MUSCLES.map((m) => [m.id, m.label]));
