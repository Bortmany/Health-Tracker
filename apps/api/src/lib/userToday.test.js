// "Today" must be the user's day, never the server's UTC day.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveToday, todayIn } from './userToday.js';

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
