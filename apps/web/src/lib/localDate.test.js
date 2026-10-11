// "Today" on the screens must be the phone's own day, not the UTC day.
// Run under both TZ=Asia/Muscat and TZ=UTC: every moment below is built on the
// local clock, so the expected day is the same in any time zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  dayOfMoment,
  daysBetween,
  formatShortDay,
  localDaysAgo,
  localToday,
  toCalendarDay,
  weekStartOf,
} from './localDate.js';

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

// The same moments pinned to real time zones, so these fail on UTC-based code
// no matter which time zone the test machine itself runs in.
function inZone(zone, fn) {
  const original = process.env.TZ;
  process.env.TZ = zone;
  try {
    fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

test('a log made at 11:30 pm in Muscat is filed on that evening\'s day', () => {
  inZone('Asia/Muscat', () => {
    // 23:30 on 8 Sep in Muscat is 19:30 UTC on 8 Sep.
    assert.equal(localToday(new Date(Date.UTC(2026, 8, 8, 19, 30))), '2026-09-08');
  });
});

test('a log made at 1:30 am in Muscat is filed on the new day, not UTC\'s yesterday', () => {
  inZone('Asia/Muscat', () => {
    // 01:30 on 9 Sep in Muscat is still 21:30 UTC on 8 Sep.
    const now = new Date(Date.UTC(2026, 8, 8, 21, 30));
    assert.equal(localToday(now), '2026-09-09');
    // The day arrows step from that day, so 9 Sep is reachable both ways.
    assert.equal(addDays(localToday(now), -1), '2026-09-08');
    assert.equal(addDays('2026-09-08', 1), '2026-09-09');
  });
});

test('late evening west of UTC stays on the local day too', () => {
  inZone('America/Los_Angeles', () => {
    // 11:30 pm on 8 Sep in Los Angeles is already 9 Sep in UTC.
    assert.equal(localToday(new Date(Date.UTC(2026, 8, 9, 6, 30))), '2026-09-08');
  });
});

test('a date from the server is cleaned into a plain day, or nothing', () => {
  assert.equal(toCalendarDay('2026-12-01'), '2026-12-01');
  assert.equal(toCalendarDay('2026-12-01T00:00:00.000Z'), '2026-12-01');
  assert.equal(toCalendarDay('2028-02-29'), '2028-02-29');
  for (const bad of [null, undefined, '', 'soon', '2026-13-45', '2026-02-30', 20261201, new Date()]) {
    assert.equal(toCalendarDay(bad), null, `${String(bad)} should not be a day`);
  }
});

test('days to target is a real number or nothing, never NaN', () => {
  for (const zone of ['Asia/Muscat', 'UTC', 'America/Los_Angeles']) {
    inZone(zone, () => {
      assert.equal(daysBetween('2026-09-08', '2026-12-01'), 84);
      assert.equal(daysBetween('2026-09-08', '2026-12-01T00:00:00.000Z'), 84);
      assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2); // across a clock change
      assert.equal(daysBetween('2026-09-08', null), null);
      assert.equal(daysBetween('2026-09-08', 'not a date'), null);
    });
  }
});
