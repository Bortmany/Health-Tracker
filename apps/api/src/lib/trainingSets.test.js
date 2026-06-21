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

test('normalizeExercises coerces blank/invalid numeric fields to null', () => {
  const result = normalizeExercises([
    { name: 'Deadlift', sets: [{ setNumber: 1, weight: '', reps: 'nope', rpe: '8.5' }] },
  ]);
  assert.equal(result[0].sets[0].weight, null);
  assert.equal(result[0].sets[0].reps, null);
  assert.equal(result[0].sets[0].rpe, 8.5);
});
