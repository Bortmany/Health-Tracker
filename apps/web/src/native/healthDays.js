// Plain date helpers for Apple Health sync. No imports, so the test runner
// can check them without the iPhone app.
//
// The rule: a reading belongs to the calendar day on the PHONE's clock, never
// the day in London (UTC). Apple Health hands back times like
// "2026-09-27T20:30:00Z"; for someone in Oman that is 12:30 am on 28 Sep, so
// cutting the first 10 characters off would file it under the wrong day.

function pad(n) {
  return String(n).padStart(2, '0');
}

// Any time (a Date, or text Apple Health gives us) -> the "YYYY-MM-DD" day it
// falls on in the phone's own time zone. Returns null if it isn't a real time.
export function localDayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Today's date on the phone's clock.
export function localToday(now = new Date()) {
  return localDayKey(now);
}

function timeOf(value) {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

// The same limits the server checks (/api/health-sync). A value outside them
// is dropped here, so one odd reading can never make the server turn away the
// whole batch. Sleep is capped at 24 hours: more than a whole day asleep on
// one date is a data glitch, not a real night.
export const LIMITS = { weight: 2000, steps: 1000000, calories: 100000, sleep: 24 };

function inRange(value, max) {
  return Number.isFinite(value) && value >= 0 && value <= max;
}

// Which app or device a reading came from. An iPhone and an Apple Watch both
// count the same walk, so readings are only ever added up within one source.
function sourceOf(sample) {
  return String(sample.sourceBundleId ?? sample.source ?? sample.sourceName ?? sample.device ?? 'unknown');
}

// Adds up readings per day, but only within one source, then keeps the source
// with the biggest total for that day. Adding the iPhone's and the Watch's
// counts together would roughly double the real number.
function dailyTotalsFromBestSource(samples) {
  const byDay = new Map(); // day -> Map(source -> total)
  for (const s of samples) {
    const key = localDayKey(s.startDate);
    const value = Number(s.value);
    if (!key || !Number.isFinite(value) || value < 0) continue;
    if (!byDay.has(key)) byDay.set(key, new Map());
    const sources = byDay.get(key);
    const source = sourceOf(s);
    sources.set(source, (sources.get(source) ?? 0) + value);
  }
  const totals = new Map();
  for (const [day, sources] of byDay) {
    totals.set(day, Math.round(Math.max(...sources.values())));
  }
  return totals;
}

// Apple's sleep categories. The number codes are Apple's own:
// 0 in bed, 1 asleep, 2 awake, 3 core, 4 deep, 5 REM. Only the "asleep"
// kinds count; lying in bed awake does not.
const ASLEEP_CODES = new Set([1, 3, 4, 5]);
const ASLEEP_WORDS = ['ASLEEP', 'CORE', 'DEEP', 'REM'];

export function isAsleep(sample) {
  const raw = sample.sleepState ?? sample.value;
  if (typeof raw === 'number') return ASLEEP_CODES.has(raw);
  const text = String(raw ?? '').trim().toUpperCase();
  if (text === '') return false;
  if (/^\d+$/.test(text)) return ASLEEP_CODES.has(Number(text));
  if (text.includes('INBED') || text.includes('IN_BED') || text.includes('AWAKE')) return false;
  return ASLEEP_WORDS.some((word) => text.includes(word));
}

// Joins overlapping or touching sleep periods into one, so the Watch and the
// iPhone recording the same night (or core + deep + REM stages that overlap)
// are only counted once.
export function mergeIntervals(intervals) {
  const sorted = intervals
    .filter(([start, end]) => start != null && end != null && end > start)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

// Turns raw Apple Health readings into one entry per day, in the exact shape
// the server's /api/health-sync endpoint expects.
//
// `today` is the phone's day. Only days BEFORE it are sent: today is still
// going, and the server only fills blanks, so a morning's 1,200 steps would
// otherwise stay on the record for good. `from` (optional) is the first day
// to send; earlier days were only partly read.
export function buildDailyEntries({
  weightSamples = [],
  stepSamples = [],
  energySamples = [],
  sleepSamples = [],
  from = null,
  today = null,
}) {
  const days = new Map();
  const day = (key) => {
    if (!days.has(key)) days.set(key, { date: key });
    return days.get(key);
  };

  // Weight: keep the most recent reading of each day.
  for (const s of weightSamples) {
    const key = localDayKey(s.startDate);
    const at = timeOf(s.startDate);
    const value = Number(s.value);
    if (!key || at == null || !inRange(value, LIMITS.weight) || value === 0) continue;
    const d = day(key);
    if (d._weightAt == null || at > d._weightAt) {
      d.weight = value;
      d._weightAt = at;
    }
  }

  // Steps and active calories: one source per day (see above).
  for (const [key, total] of dailyTotalsFromBestSource(stepSamples)) {
    if (inRange(total, LIMITS.steps)) day(key).steps = total;
  }
  for (const [key, total] of dailyTotalsFromBestSource(energySamples)) {
    if (inRange(total, LIMITS.calories)) day(key).calories = total;
  }

  // Sleep: merge overlapping "asleep" periods, then credit each one to the
  // day the user woke up.
  const asleep = mergeIntervals(
    sleepSamples.filter(isAsleep).map((s) => [timeOf(s.startDate), timeOf(s.endDate)])
  );
  const sleepByDay = new Map();
  for (const [start, end] of asleep) {
    const key = localDayKey(new Date(end));
    if (!key) continue;
    sleepByDay.set(key, (sleepByDay.get(key) ?? 0) + (end - start) / 3600000);
  }
  for (const [key, hours] of sleepByDay) {
    const rounded = Math.round(hours * 10) / 10;
    if (rounded > 0 && inRange(rounded, LIMITS.sleep)) day(key).sleep = rounded;
  }

  return [...days.values()]
    .map(({ _weightAt, ...entry }) => entry)
    .filter((e) => (today == null || e.date < today) && (from == null || e.date >= from))
    .filter((e) => e.weight != null || e.steps != null || e.calories != null || e.sleep != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
