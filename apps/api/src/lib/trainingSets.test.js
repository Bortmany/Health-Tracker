import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExercises } from './trainingSets.js';

test('normalizeExercises drops exercises without a name', () => {
  const result = normalizeExercises([{ name: '' }, { sets: [] }, { name: 'Squat', sets: [] }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Squat');
});

test('normalizeExercises defaults set numbers from array position', () => {
  const result = normalizeExercises([
    { name: 'Bench Press', sets: [{ weight: 60, reps: 8 }, { weight: 62.5, reps: 6 }] },
  ]);
  assert.equal(result[0].sets[0].setNumber, 1);
  assert.equal(result[0].sets[1].setNumber, 2);
});

test('normalizeExercises treats blank numeric fields as null and parses valid ones', () => {
  const result = normalizeExercises([
    { name: 'Deadlift', sets: [{ setNumber: 1, weight: '', reps: 5, rpe: '8.5' }] },
  ]);
  assert.equal(result[0].sets[0].weight, null);
  assert.equal(result[0].sets[0].reps, 5);
  assert.equal(result[0].sets[0].rpe, 8.5);
});

test('normalizeExercises rejects text, negative and infinite numbers', () => {
  // Non-numeric text is no longer silently dropped — it is rejected outright.
  assert.throws(() => normalizeExercises([{ name: 'Deadlift', sets: [{ reps: 'nope' }] }]), /reps/);
  // A negative rep count used to sneak in as a fake personal record.
  assert.throws(() => normalizeExercises([{ name: 'Deadlift', sets: [{ reps: -5 }] }]), /reps/);
  // 1e400 parses to Infinity, which broke the Progress chart with NaN.
  assert.throws(() => normalizeExercises([{ name: 'Deadlift', sets: [{ weight: 1e400 }] }]), /weight/);
});
