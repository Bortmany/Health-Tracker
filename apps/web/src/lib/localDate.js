// Dates on this device's clock, as 'YYYY-MM-DD'.
// Never use new Date().toISOString().slice(0, 10) for this: that is the UTC
// day, which in Oman is still "yesterday" until 4 am.

function pad(n) {
  return String(n).padStart(2, '0');
}

// The 'YYYY-MM-DD' day a moment falls on, on this device's clock.
export function localDayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Today's date on this device's clock.
export function localToday(now = new Date()) {
  return localDayKey(now);
}

// A 'YYYY-MM-DD' day moved forward (or back, with a negative number) by whole
// days. Works on the calendar itself, so it never slips a day around midnight.
export function addDays(day, days) {
  const [y, m, d] = day.split('-').map(Number);
  return localDayKey(new Date(y, m - 1, d + days));
}

// The day `n` days before today, on this device's clock.
export function localDaysAgo(n, now = new Date()) {
  return addDays(localToday(now), -n);
}

// Any date value (from the server, a form or storage) cleaned into a plain
// 'YYYY-MM-DD' day, or null when it's missing or not a real calendar date.
// A full timestamp like '2026-12-01T00:00:00.000Z' keeps its date part, so an
// older server reply still shows the day instead of a blank box or "NaN".
export function toCalendarDay(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value.trim());
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  const real = check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
  return real ? match[0].slice(0, 10) : null;
}

// Whole calendar days from `from` to `to`, or null if either isn't a real day
// (so the screen can show "—" instead of "NaN").
export function daysBetween(from, to) {
  const a = toCalendarDay(from);
  const b = toCalendarDay(to);
  if (!a || !b) return null;
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
