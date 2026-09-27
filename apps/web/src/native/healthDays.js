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

// Turns raw Apple Health readings into one entry per day, in the exact shape
// the server's /api/health-sync endpoint expects.
export function buildDailyEntries({ weightSamples = [], stepSamples = [], energySamples = [], sleepSamples = [] }) {
  const days = new Map();
  const day = (key) => {
    if (!days.has(key)) days.set(key, { date: key });
    return days.get(key);
  };

  // Weight: keep the most recent reading of each day.
  for (const s of weightSamples) {
    const key = localDayKey(s.startDate);
    const at = timeOf(s.startDate);
    if (!key || at == null) continue;
    const d = day(key);
    if (d._weightAt == null || at > d._weightAt) {
      d.weight = Number(s.value);
      d._weightAt = at;
    }
  }

  // Steps and active calories: add up all readings in the day.
  for (const s of stepSamples) {
    const key = localDayKey(s.startDate);
    if (!key) continue;
    const d = day(key);
    d.steps = (d.steps ?? 0) + Math.round(Number(s.value));
  }
  for (const s of energySamples) {
    const key = localDayKey(s.startDate);
    if (!key) continue;
    const d = day(key);
    d.calories = (d.calories ?? 0) + Math.round(Number(s.value));
  }

  // Sleep: add up the hours of "asleep" periods, credited to the wake-up day.
  for (const s of sleepSamples) {
    const label = String(s.value ?? '').toUpperCase();
    if (label.includes('IN_BED') || label.includes('INBED') || label.includes('AWAKE')) continue;
    const hours = (new Date(s.endDate) - new Date(s.startDate)) / 3600000;
    if (!Number.isFinite(hours) || hours <= 0) continue;
    const key = localDayKey(s.endDate);
    if (!key) continue;
    const d = day(key);
    d.sleep = (d.sleep ?? 0) + hours;
  }

  return [...days.values()]
    .map(({ _weightAt, ...entry }) => ({
      ...entry,
      ...(entry.sleep != null ? { sleep: Math.round(entry.sleep * 10) / 10 } : {}),
    }))
    .filter((e) => e.weight != null || e.steps != null || e.calories != null || e.sleep != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
