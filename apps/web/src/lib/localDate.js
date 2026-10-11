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

// The Monday that starts the week a 'YYYY-MM-DD' day falls in (weeks run
// Monday to Sunday), or null when the day isn't a real date.
export function weekStartOf(day) {
  const clean = toCalendarDay(day);
  if (!clean) return null;
  const [y, m, d] = clean.split('-').map(Number);
  // getDay(): Sunday is 0, so Sunday steps back 6 days and Monday stays put.
  const weekday = new Date(y, m - 1, d).getDay();
  return addDays(clean, -((weekday + 6) % 7));
}

// The device's own day a moment (an ISO timestamp from the server) falls on,
// or null when it can't be read. A plain 'YYYY-MM-DD' day is kept as it is.
export function dayOfMoment(value) {
  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return toCalendarDay(value);
  const moment = new Date(value);
  return Number.isNaN(moment.getTime()) ? null : localDayKey(moment);
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

// A day written the Cut way: "8 Sept", day first, with the year added only
// when it isn't this year ("8 Sept 2025"). A missing or broken day shows "—".
export function formatShortDay(day, today = localToday()) {
  const clean = toCalendarDay(day);
  if (!clean) return '—';
  const [y, m, d] = clean.split('-').map(Number);
  const label = `${d} ${SHORT_MONTHS[m - 1]}`;
  return String(y) === today.slice(0, 4) ? label : `${label} ${y}`;
}
