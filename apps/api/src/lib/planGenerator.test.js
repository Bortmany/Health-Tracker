import assert from 'node:assert/strict';
import { test } from 'node:test';
import { phaseForWeek, rankTemplates, scoreTemplate, weekTargets } from './planGenerator.js';

const barbellPlan = {
  name: 'Barbell basics',
  goal: 'powerlifting',
  experience: 'beginner',
  equipment: 'full_gym',
  days_per_week: 3,
  min_age: null,
  max_age: null,
};

const bodyweightPlan = {
  name: 'Bodyweight basics',
  goal: 'calisthenics',
  experience: 'beginner',
  equipment: 'none',
  days_per_week: 3,
  min_age: null,
  max_age: null,
};

test('a plan needing a gym is ruled out for someone with no equipment', () => {
  const score = scoreTemplate(barbellPlan, { equipment: 'none', trainingGoal: 'powerlifting' });
  assert.equal(score, null);
});

test('the best match wins: goal and experience beat a partial match', () => {
  const ranked = rankTemplates([barbellPlan, bodyweightPlan], {
    equipment: 'none',
    trainingGoal: 'calisthenics',
    experienceLevel: 'beginner',
    daysPerWeek: 3,
  });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].template.name, 'Bodyweight basics');
});

test('age limits rule a plan in or out', () => {
  const overFifty = { ...bodyweightPlan, min_age: 50 };
  assert.equal(scoreTemplate(overFifty, { age: 30, equipment: 'none' }), null);
  assert.notEqual(scoreTemplate(overFifty, { age: 55, equipment: 'none' }), null);
});

test('every 4th week is an easy (deload) week when the plan says so', () => {
  const rules = { progression: { type: 'weight', weightPct: 2.5, deloadEveryWeeks: 4 }, phases: [] };
  assert.equal(weekTargets(rules, 3, 4).deload, false);
  assert.equal(weekTargets(rules, 4, 4).deload, true);
});

test('week numbers map to the right phase of a year plan', () => {
  const phases = [
    { name: 'Foundation', weeks: 8, focus: 'technique' },
    { name: 'Build', weeks: 12, focus: 'adding weight' },
  ];
  assert.equal(phaseForWeek(phases, 1).name, 'Foundation');
  assert.equal(phaseForWeek(phases, 8).name, 'Foundation');
  assert.equal(phaseForWeek(phases, 9).name, 'Build');
});
