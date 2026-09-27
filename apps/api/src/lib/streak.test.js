// The logging streak counts from the user's own day, never the server's UTC day.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countStreak } from './streak.js';
import { todayIn } from './userToday.js';

// 11:30 pm on 27 Sep in Oman (7:30 pm UTC).
const LATE_EVENING = new Date('2026-09-27T19:30:00Z');
// 1 am on 28 Sep in Oman, while it is still 27 Sep in UTC.
const JUST_AFTER_MIDNIGHT = new Date('2026-09-27T21:00:00Z');

test('late in the evening, today and the days before count', () => {
  const today = todayIn('Asia/Muscat', LATE_EVENING);
  assert.equal(today, '2026-09-27');
  assert.equal(countStreak(['2026-09-25', '2026-09-26', '2026-09-27'], today), 3);
});

test('just after midnight in Oman, a log made a few minutes ago counts for the new day', () => {
  const today = todayIn('Asia/Muscat', JUST_AFTER_MIDNIGHT);
  assert.equal(today, '2026-09-28');
  // Logged 26, 27 and (at 12:30 am) the 28th: three in a row. Counting from
  // the UTC day (27th) would have ignored the 28th.
  assert.equal(countStreak(['2026-09-26', '2026-09-27', '2026-09-28'], today), 3);
  // Nothing logged yet on the new day: yesterday's streak still stands.
  assert.equal(countStreak(['2026-09-26', '2026-09-27'], today), 2);
});

test('a gap ends the streak, and nothing recent means zero', () => {
  assert.equal(countStreak(['2026-09-24', '2026-09-26', '2026-09-27'], '2026-09-27'), 2);
  assert.equal(countStreak(['2026-09-20'], '2026-09-27'), 0);
  assert.equal(countStreak([], '2026-09-27'), 0);
});

test('the streak runs across month and year ends', () => {
  assert.equal(countStreak(['2026-12-30', '2026-12-31', '2027-01-01'], '2027-01-01'), 3);
  assert.equal(countStreak(['2026-02-28', '2026-03-01'], '2026-03-01'), 2);
});
