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

// Whole days between a row's date and today (both plain 'YYYY-MM-DD'
// strings), never negative. Dates come from Postgres as text (date::text), so
// no time zone can shift them.
function ageInDays(day, today) {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = today.slice(0, 10).split('-').map(Number);
  const diff = (Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000;
  return Math.max(0, diff);
}

/**
 * rows: one entry per (muscle, role, exercise name, workout date) with:
 *   muscle, role_weight (1.0 primary / 0.5 secondary), name, date,
 *   sets (count), volume (sum of weight * reps, 0 when bodyweight-only).
 * today: the user's own day as 'YYYY-MM-DD' (see lib/userToday.js).
 * Returns an array (canonical muscle order, only muscles with data):
 *   { muscle, intensity, totalSets, totalVolume, lastTrained, topExercises }
 */
export function computeHeatmap(rows, today) {
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

    const day = String(row.date).slice(0, 10);
    const sets = Number(row.sets);
    const roleWeight = Number(row.role_weight);
    const decay = Math.pow(0.5, ageInDays(day, today) / HALF_LIFE_DAYS);

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
