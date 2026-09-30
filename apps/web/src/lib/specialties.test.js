// The retired "nutrition" specialty stays readable for older saved profiles
// but is never offered as a choice or shown as a chip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIALTIES, hasVisibleSpecialty, specialtyLabel, visibleSpecialties } from './specialties.js';

test('nutrition is not offered in the picker or the directory filter', () => {
  assert.equal(SPECIALTIES.some((s) => s.code === 'nutrition'), false);
  assert.equal(SPECIALTIES.some((s) => s.code === 'fat-loss'), true);
});

test('a stored nutrition code is hidden from chips but still has words', () => {
  assert.deepEqual(visibleSpecialties(['fat-loss', 'nutrition', 'strength']), ['fat-loss', 'strength']);
  assert.deepEqual(visibleSpecialties(undefined), []);
  assert.equal(specialtyLabel('nutrition'), 'Nutrition');
});

test('a profile whose only specialty is nutrition counts as having none', () => {
  assert.equal(hasVisibleSpecialty(['nutrition']), false);
  assert.equal(hasVisibleSpecialty([]), false);
  assert.equal(hasVisibleSpecialty(undefined), false);
  assert.equal(hasVisibleSpecialty(['nutrition', 'running']), true);
});
