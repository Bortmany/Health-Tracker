// Body measurement rules. Only plain 'YYYY-MM-DD' days are used, so these
// pass the same under TZ=Asia/Muscat and TZ=UTC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultMeasurement,
  emptyMeasurementText,
  formatCm,
  measurementCaption,
  measurementPayload,
  rangeError,
  rangeErrors,
  seriesFor,
} from './measurements.js';

test('rangeError uses the exact sentence for each measurement', () => {
  assert.equal(rangeError('chest', '251'), 'Chest should be between 30 and 250 cm.');
  assert.equal(rangeError('arms', '9.9'), 'Arms should be between 10 and 100 cm.');
  assert.equal(rangeError('hips', '20'), 'Hips should be between 30 and 250 cm.');
  assert.equal(rangeError('thighs', '151'), 'Thighs should be between 20 and 150 cm.');
  assert.equal(rangeError('neck', '999'), 'Neck should be between 15 and 80 cm.');
});

test('rangeError accepts the edges, blanks and waist', () => {
  assert.equal(rangeError('chest', '30'), null);
  assert.equal(rangeError('chest', '250'), null);
  assert.equal(rangeError('neck', ''), null);
  assert.equal(rangeError('neck', null), null);
  assert.equal(rangeError('waist', '999'), null);
  assert.equal(rangeError('neck', 'abc'), 'Neck should be between 15 and 80 cm.');
});

test('rangeErrors lists only the boxes that need a look', () => {
  assert.deepEqual(rangeErrors({ waist: '84', chest: '98', arms: '5', neck: '' }), {
    arms: 'Arms should be between 10 and 100 cm.',
  });
  assert.deepEqual(rangeErrors({}), {});
});

test('measurementPayload turns blanks into null and text into numbers', () => {
  assert.deepEqual(measurementPayload({ waist: '84.5', chest: '', arms: 34, hips: '', thighs: '58', neck: '' }), {
    waist: 84.5,
    chest: null,
    arms: 34,
    hips: null,
    thighs: 58,
    neck: null,
  });
});

test('seriesFor keeps one measurement, oldest first, skipping gaps and bad days', () => {
  const rows = [
    { date: '2026-09-01', chest: 100, waist: null },
    { date: '2026-09-02', chest: null, waist: 84 },
    { date: 'nonsense', chest: 99 },
    { date: '2026-09-03', chest: '98.5' },
  ];
  assert.deepEqual(seriesFor(rows, 'chest'), [
    { date: '2026-09-01', value: 100 },
    { date: '2026-09-03', value: 98.5 },
  ]);
  assert.deepEqual(seriesFor(null, 'chest'), []);
});

test('defaultMeasurement picks the first with data, else Waist', () => {
  assert.equal(defaultMeasurement([{ date: '2026-09-01', arms: 34 }]), 'arms');
  assert.equal(defaultMeasurement([{ date: '2026-09-01', arms: 34, waist: 80 }]), 'waist');
  assert.equal(defaultMeasurement([]), 'waist');
});

test('formatCm prints plain centimetres', () => {
  assert.equal(formatCm(98), '98 cm');
  assert.equal(formatCm(98.25), '98.3 cm');
  assert.equal(formatCm('x'), '—');
});

function entries(list) {
  return list.map(([date, value]) => ({ date, value }));
}

test('caption: a trend rate needs 14+ days and 4+ entries', () => {
  const enough = entries([
    ['2026-09-01', 100],
    ['2026-09-05', 99.5],
    ['2026-09-10', 99.2],
    ['2026-09-15', 99],
  ]);
  assert.equal(measurementCaption(enough, '2026-09-30'), 'Down about 0.5 cm a week');

  const up = entries([
    ['2026-09-01', 34],
    ['2026-09-08', 34.5],
    ['2026-09-10', 35],
    ['2026-09-15', 35],
  ]);
  assert.equal(measurementCaption(up, '2026-09-30'), 'Up about 0.5 cm a week');

  const flat = entries([
    ['2026-09-01', 38],
    ['2026-09-05', 38],
    ['2026-09-10', 38],
    ['2026-09-15', 38],
  ]);
  assert.equal(measurementCaption(flat, '2026-09-30'), 'Holding steady');
});

test('caption: too short or too few gives the gentle nudge', () => {
  const tooShort = entries([
    ['2026-09-01', 100],
    ['2026-09-05', 99],
    ['2026-09-10', 98],
    ['2026-09-14', 97],
  ]);
  assert.equal(measurementCaption(tooShort, '2026-09-30'), 'Add a few more over two weeks to see a trend.');

  const tooFew = entries([
    ['2026-09-01', 100],
    ['2026-09-10', 99],
    ['2026-09-20', 98],
  ]);
  assert.equal(measurementCaption(tooFew, '2026-09-30'), 'Add a few more over two weeks to see a trend.');
});

test('caption: exactly one entry names it, and nothing for none', () => {
  assert.equal(measurementCaption(entries([['2026-09-08', 98]]), '2026-09-30'), 'First entry: 98 cm on 8 Sept.');
  assert.equal(measurementCaption([], '2026-09-30'), null);
});

test('emptyMeasurementText names the measurement', () => {
  assert.equal(
    emptyMeasurementText('chest'),
    'No chest measurements yet. A tape measure and two minutes is all it takes.'
  );
});
