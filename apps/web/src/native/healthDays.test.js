// Apple Health readings must land on the day shown on the phone's clock,
// not the UTC day. Run under both TZ=Asia/Muscat and TZ=UTC: every time
// below is built from the local clock, so the expected day is the same
// in any time zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyEntries, isAsleep, localDayKey, localToday, mergeIntervals } from './healthDays.js';

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

test('today is never sent, so a morning\'s part-day numbers cannot get stuck', () => {
  const entries = buildDailyEntries({
    stepSamples: [
      { startDate: at(2026, 9, 27, 22), value: 9000 },
      { startDate: at(2026, 9, 28, 0, 20), value: 1200 }, // today, still going
    ],
    today: '2026-09-28',
  });
  assert.deepEqual(entries, [{ date: '2026-09-27', steps: 9000 }]);
});

test('days before the first fully-read day are left out', () => {
  const entries = buildDailyEntries({
    stepSamples: [
      { startDate: at(2026, 8, 28, 12), value: 500 },
      { startDate: at(2026, 8, 29, 12), value: 700 },
    ],
    from: '2026-08-29',
    today: '2026-09-28',
  });
  assert.deepEqual(entries, [{ date: '2026-08-29', steps: 700 }]);
});

test('iPhone and Apple Watch steps are not added together', () => {
  const entries = buildDailyEntries({
    stepSamples: [
      { startDate: at(2026, 9, 27, 9), value: 4000, sourceBundleId: 'com.apple.health.phone' },
      { startDate: at(2026, 9, 27, 18), value: 3000, sourceBundleId: 'com.apple.health.phone' },
      { startDate: at(2026, 9, 27, 9), value: 4200, sourceBundleId: 'com.apple.health.watch' },
      { startDate: at(2026, 9, 27, 18), value: 3100, sourceBundleId: 'com.apple.health.watch' },
    ],
    energySamples: [
      { startDate: at(2026, 9, 27, 9), value: 200, source: 'iPhone' },
      { startDate: at(2026, 9, 27, 9), value: 260, source: 'Apple Watch' },
    ],
  });
  // The source with the bigger day total wins: the Watch, 7,300 steps.
  assert.deepEqual(entries, [{ date: '2026-09-27', steps: 7300, calories: 260 }]);
});

test('the best source is picked day by day', () => {
  const entries = buildDailyEntries({
    stepSamples: [
      { startDate: at(2026, 9, 26, 10), value: 5000, source: 'iPhone' },
      { startDate: at(2026, 9, 26, 10), value: 100, source: 'Watch' },
      { startDate: at(2026, 9, 27, 10), value: 800, source: 'iPhone' },
      { startDate: at(2026, 9, 27, 10), value: 6000, source: 'Watch' },
    ],
  });
  assert.deepEqual(entries.map((e) => e.steps), [5000, 6000]);
});

test('overlapping sleep records from two devices count once', () => {
  const entries = buildDailyEntries({
    sleepSamples: [
      { startDate: at(2026, 9, 27, 23), endDate: at(2026, 9, 28, 6), value: 'ASLEEP', source: 'iPhone' },
      { startDate: at(2026, 9, 27, 23, 30), endDate: at(2026, 9, 28, 7), value: 'ASLEEP', source: 'Watch' },
      // Watch sleep stages inside the same night.
      { startDate: at(2026, 9, 28, 1), endDate: at(2026, 9, 28, 2), value: 4 },
      { startDate: at(2026, 9, 28, 2), endDate: at(2026, 9, 28, 3), value: 'REM' },
    ],
  });
  // 11 pm to 7 am = 8 hours, not 6.5 + 7 + 1 + 1.
  assert.deepEqual(entries, [{ date: '2026-09-28', sleep: 8 }]);
});

test('a separate afternoon nap adds to the day', () => {
  const entries = buildDailyEntries({
    sleepSamples: [
      { startDate: at(2026, 9, 27, 23), endDate: at(2026, 9, 28, 6), value: 1 },
      { startDate: at(2026, 9, 28, 14), endDate: at(2026, 9, 28, 14, 30), value: '3' },
    ],
  });
  assert.deepEqual(entries, [{ date: '2026-09-28', sleep: 7.5 }]);
});

test('only the asleep kinds of sleep count, as words or as Apple\'s number codes', () => {
  for (const v of ['ASLEEP', 'asleepCore', 'HKCategoryValueSleepAnalysisAsleepDeep', 'REM', 1, 3, 4, 5, '5']) {
    assert.equal(isAsleep({ value: v }), true, `expected ${v} to count`);
  }
  for (const v of ['INBED', 'IN_BED', 'inBed', 'AWAKE', 'awake', 0, 2, '0', '', null, undefined, 'something']) {
    assert.equal(isAsleep({ value: v }), false, `expected ${v} not to count`);
  }
  // The plugin's own sleepState field is preferred when it is there.
  assert.equal(isAsleep({ sleepState: 'InBed', value: 1 }), false);
  assert.equal(isAsleep({ sleepState: 'Asleep', value: 0 }), true);

  const entries = buildDailyEntries({
    sleepSamples: [
      { startDate: at(2026, 9, 27, 22), endDate: at(2026, 9, 28, 7), value: 0 }, // in bed
      { startDate: at(2026, 9, 28, 3), endDate: at(2026, 9, 28, 4), value: 2 }, // awake
    ],
  });
  assert.deepEqual(entries, []);
});

test('merging sleep periods joins overlaps and touching ends only', () => {
  assert.deepEqual(mergeIntervals([[5, 8], [1, 3], [2, 4], [4, 5], [10, 12]]), [[1, 8], [10, 12]]);
  assert.deepEqual(mergeIntervals([[3, 3], [null, 5], [6, 4]]), []);
});

test('one impossible day is dropped instead of making the server refuse the whole batch', () => {
  const entries = buildDailyEntries({
    sleepSamples: [
      // A stuck sensor: "asleep" for 50 hours.
      { startDate: at(2026, 9, 24, 20), endDate: at(2026, 9, 26, 22), value: 'ASLEEP' },
      { startDate: at(2026, 9, 26, 23), endDate: at(2026, 9, 27, 6), value: 'ASLEEP' },
    ],
    stepSamples: [
      { startDate: at(2026, 9, 25, 10), value: 5000000 },
      { startDate: at(2026, 9, 27, 10), value: 8000 },
    ],
    energySamples: [{ startDate: at(2026, 9, 25, 10), value: 999999 }],
    weightSamples: [
      { startDate: at(2026, 9, 25, 7), value: 99999 },
      { startDate: at(2026, 9, 27, 7), value: -3 },
      { startDate: at(2026, 9, 27, 8), value: 'abc' },
    ],
  });
  assert.deepEqual(entries, [{ date: '2026-09-27', steps: 8000, sleep: 7 }]);
  // Everything left is inside the server's limits.
  for (const e of entries) {
    if (e.sleep != null) assert.ok(e.sleep <= 24);
    if (e.steps != null) assert.ok(e.steps <= 1000000);
  }
});
