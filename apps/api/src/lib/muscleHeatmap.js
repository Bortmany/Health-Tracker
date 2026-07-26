// Pure math for the muscle heatmap: turns "which sets hit which muscles on
// which days" rows into a 0-100 freshness score per muscle. No database or
// HTTP in here, so it can be unit-tested directly.

// The 16 body regions the frontend body map can colour. Order here is the
// order muscles appear in the API response.
export const MUSCLES = [
  'chest',
  'front-delts',
  'side-delts',
  'rear-delts',
  'biceps',
  'triceps',
  'forearms',
  'traps',
  'lats',
  'lower-back',
  'abs',
  'obliques',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
];

// Training credit halves every 3 days, so last week's session fades while
// yesterday's still glows.
const HALF_LIFE_DAYS = 3;

// 9 "fresh main-mover sets" (e.g. 3 hard sessions of 3 sets in the last few
// days) maps to a full-brightness score of 100.
const FULL_SCORE_RAW = 9;

// Accepts either a 'YYYY-MM-DD...' string or a JS Date and returns the plain
// day part.
function toDay(value) {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

// Whole days between a row's date and "now", never negative.
function ageInDays(day, now) {
  const [y, m, d] = day.split('-').map(Number);
  const nowDay = toDay(now);
  const [ny, nm, nd] = nowDay.split('-').map(Number);
  const diff = (Date.UTC(ny, nm - 1, nd) - Date.UTC(y, m - 1, d)) / 86400000;
  return Math.max(0, diff);
}

/**
 * rows: one entry per (muscle, role, exercise name, workout date) with:
 *   muscle, role_weight (1.0 primary / 0.5 secondary), name, date,
 *   sets (count), volume (sum of weight * reps, 0 when bodyweight-only).
 * Returns an array (canonical muscle order, only muscles with data):
 *   { muscle, intensity, totalSets, totalVolume, lastTrained, topExercises }
 */
export function computeHeatmap(rows, now = new Date()) {
  const byMuscle = new Map();

  for (const row of rows) {
    const muscle = row.muscle;
    if (!byMuscle.has(muscle)) {
      byMuscle.set(muscle, {
        raw: 0,
        totalSets: 0,
        totalVolume: 0,
        lastTrained: null,
        exerciseSets: new Map(),
      });
    }
    const entry = byMuscle.get(muscle);

    const day = toDay(row.date);
    const sets = Number(row.sets);
    const roleWeight = Number(row.role_weight);
    const decay = Math.pow(0.5, ageInDays(day, now) / HALF_LIFE_DAYS);

    entry.raw += roleWeight * sets * decay;
    // A set counts toward every muscle it touches (a pull-up set counts for
    // both lats and biceps), but only once per muscle.
    entry.totalSets += sets;
    entry.totalVolume += Number(row.volume);
    if (!entry.lastTrained || day > entry.lastTrained) entry.lastTrained = day;
    entry.exerciseSets.set(row.name, (entry.exerciseSets.get(row.name) ?? 0) + sets);
  }

  const result = [];
  for (const muscle of MUSCLES) {
    const entry = byMuscle.get(muscle);
    if (!entry) continue;
    const topExercises = [...entry.exerciseSets.entries()]
      .map(([name, sets]) => ({ name, sets }))
      .sort((a, b) => b.sets - a.sets)
      .slice(0, 3);
    result.push({
      muscle,
      intensity: Math.min(100, Math.round((100 * entry.raw) / FULL_SCORE_RAW)),
      totalSets: entry.totalSets,
      totalVolume: entry.totalVolume,
      lastTrained: entry.lastTrained,
      topExercises,
    });
  }
  return result;
}
