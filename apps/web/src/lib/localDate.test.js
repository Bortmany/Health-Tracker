// "Today" on the screens must be the phone's own day, not the UTC day.
// Run under both TZ=Asia/Muscat and TZ=UTC: every moment below is built on the
// local clock, so the expected day is the same in any time zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, localDaysAgo, localToday } from './localDate.js';

test('late in the evening it is still the same day', () => {
  // 11:59 pm on 27 Sep.
  assert.equal(localToday(new Date(2026, 8, 27, 23, 59)), '2026-09-27');
});

test('just after midnight it is already the new day', () => {
  // 1 am on 28 Sep in Oman is still 27 Sep in UTC; the screen must say the 28th.
  assert.equal(localToday(new Date(2026, 8, 28, 1, 0)), '2026-09-28');
  assert.equal(localToday(new Date(2026, 8, 28, 0, 1)), '2026-09-28');
});

test('stepping a day forward or back stays on the calendar', () => {
  assert.equal(addDays('2026-09-28', 1), '2026-09-29');
  assert.equal(addDays('2026-09-28', -1), '2026-09-27');
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('days ago counts back from the phone\'s day, even just after midnight', () => {
  const justAfterMidnight = new Date(2026, 8, 28, 0, 30);
  assert.equal(localDaysAgo(0, justAfterMidnight), '2026-09-28');
  assert.equal(localDaysAgo(6, justAfterMidnight), '2026-09-22');
  assert.equal(localDaysAgo(29, new Date(2026, 8, 27, 23, 30)), '2026-08-29');
});
