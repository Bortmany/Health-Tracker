// Apple Health readings must land on the day shown on the phone's clock,
// not the UTC day. Run under both TZ=Asia/Muscat and TZ=UTC: every time
// below is built from the local clock, so the expected day is the same
// in any time zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyEntries, localDayKey, localToday } from './healthDays.js';

// A time on the phone's own clock, sent the way Apple Health sends it (UTC text).
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

test('a reading just after midnight belongs to the new day on the phone', () => {
  // 12:30 am on 28 Sep in Oman is still 27 Sep in UTC.
  assert.equal(localDayKey(at(2026, 9, 28, 0, 30)), '2026-09-28');
  assert.equal(localDayKey(at(2026, 9, 27, 23, 45)), '2026-09-27');
});

test('today is the phone\'s day, even late in the evening', () => {
  assert.equal(localToday(new Date(2026, 8, 27, 23, 59)), '2026-09-27');
  assert.equal(localToday(new Date(2026, 8, 28, 0, 1)), '2026-09-28');
});

test('bad times are skipped rather than filed under a made-up day', () => {
  assert.equal(localDayKey('not a date'), null);
  const entries = buildDailyEntries({ stepSamples: [{ startDate: 'nonsense', value: 500 }] });
  assert.deepEqual(entries, []);
});

test('late-evening and just-after-midnight readings go to their own days', () => {
  const entries = buildDailyEntries({
    weightSamples: [
      { startDate: at(2026, 9, 27, 7), value: 81.4 },
      { startDate: at(2026, 9, 27, 22, 30), value: 81.0 }, // latest on the 27th wins
      { startDate: at(2026, 9, 28, 0, 15), value: 80.8 },
    ],
    stepSamples: [
      { startDate: at(2026, 9, 27, 21), value: 3000 },
      { startDate: at(2026, 9, 27, 23, 50), value: 200 },
      { startDate: at(2026, 9, 28, 0, 10), value: 150 },
    ],
    energySamples: [{ startDate: at(2026, 9, 27, 23), value: 120.4 }],
    sleepSamples: [
      // Asleep 11 pm on the 27th to 6:30 am on the 28th: counts for the wake-up day.
      { startDate: at(2026, 9, 27, 23), endDate: at(2026, 9, 28, 6, 30), value: 'ASLEEP' },
      { startDate: at(2026, 9, 27, 22, 30), endDate: at(2026, 9, 28, 6, 45), value: 'INBED' },
    ],
  });

  assert.deepEqual(entries, [
    { date: '2026-09-27', weight: 81.0, steps: 3200, calories: 120 },
    { date: '2026-09-28', weight: 80.8, steps: 150, sleep: 7.5 },
  ]);
});
