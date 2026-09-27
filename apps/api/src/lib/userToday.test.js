// "Today" must be the user's day, never the server's UTC day.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, daysBetween, resolveToday, todayIn, weekStartOf } from './userToday.js';

// 9:30 pm UTC on 27 Sep is 1:30 am on 28 Sep in Oman.
const LATE = new Date('2026-09-27T21:30:00Z');

test('Oman is already on the next day late in the UTC evening', () => {
  assert.equal(todayIn('Asia/Muscat', LATE), '2026-09-28');
  assert.equal(todayIn('UTC', LATE), '2026-09-27');
});

test('with no day sent, today is Oman\'s day', () => {
  assert.equal(resolveToday(undefined, LATE), '2026-09-28');
  assert.equal(resolveToday('', LATE), '2026-09-28');
});

test('a day sent by the device is used as long as it is today somewhere', () => {
  assert.equal(resolveToday('2026-09-28', LATE), '2026-09-28');
  assert.equal(resolveToday('2026-09-26', LATE), '2026-09-26');
  assert.throws(() => resolveToday('2026-09-30', LATE), /today/);
  assert.throws(() => resolveToday('2026-09-25', LATE), /today/);
  assert.throws(() => resolveToday('28/09/2026', LATE), /YYYY-MM-DD/);
});

test('moving by whole days follows the calendar', () => {
  assert.equal(addDays('2026-09-28', -1), '2026-09-27');
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(daysBetween('2026-09-21', '2026-09-28'), 7);
  assert.equal(daysBetween('2026-09-28', '2026-09-21'), -7);
});

test('weeks start on Monday', () => {
  assert.equal(weekStartOf('2026-09-28'), '2026-09-28'); // a Monday
  assert.equal(weekStartOf('2026-09-27'), '2026-09-21'); // Sunday belongs to the week before
  assert.equal(weekStartOf('2026-10-01'), '2026-09-28');
});
