import { addDays } from './userToday.js';

// How many days in a row have a log, counting back from `today` (the user's
// own day, see userToday.js). A streak that ended yesterday still counts
// while nothing has been logged yet today; the first gap before that ends it.
export function countStreak(dates, today) {
  const logged = dates instanceof Set ? dates : new Set(dates);
  let cursor = logged.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (logged.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
