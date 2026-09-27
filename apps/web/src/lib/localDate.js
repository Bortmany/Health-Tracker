// Today's date on this device's clock, as 'YYYY-MM-DD'.
// Never use new Date().toISOString().slice(0, 10) for this: that is the UTC
// day, which in Oman is still "yesterday" until 4 am.
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
