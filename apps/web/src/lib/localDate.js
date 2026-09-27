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
