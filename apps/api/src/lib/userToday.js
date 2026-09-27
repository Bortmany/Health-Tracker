// "Today" for the person using the app, as a plain YYYY-MM-DD string.
//
// The server's clock (and Postgres's CURRENT_DATE) runs on UTC, which is four
// hours behind Oman: at 11 pm in Muscat the server still thinks it's the day
// before. So the screens send their own day (?today=YYYY-MM-DD), and when a
// caller doesn't, we use Oman's day, since that's where Cut's users are.

import { ValidationError, isoDate } from './validate.js';

export const DEFAULT_TIME_ZONE = 'Asia/Muscat';

// The calendar day at `now` in the given time zone.
export function todayIn(timeZone = DEFAULT_TIME_ZONE, now = new Date()) {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// Accepts the day a screen says it is. Every place on Earth is within one day
// of UTC, so anything further off is a mistake and gets a plain 400.
export function resolveToday(value, now = new Date()) {
  if (value == null || value === '') return todayIn(DEFAULT_TIME_ZONE, now);
  const day = isoDate(value, 'today');
  const utcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const offsetDays = Math.abs(Date.parse(`${day}T00:00:00Z`) - utcDay) / 86400000;
  if (offsetDays > 1) {
    throw new ValidationError("today must be today's date on your device");
  }
  return day;
}
