// Plain-logic tests for the weekly check-in rules (run with `npm test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blankQuestionRows,
  DEFAULT_QUESTIONS,
  firstName,
  formatWeightChange,
  habitsValue,
  initialForm,
  isFormDirty,
  isRateLimited,
  moodLabel,
  moodSummary,
  prefillAnswers,
  questionsChanged,
  toCheckinBody,
} from './checkin.js';

test('each mood has its word, and anything else has none', () => {
  assert.equal(moodLabel(1), 'Rough');
  assert.equal(moodLabel(3), 'OK');
  assert.equal(moodLabel(5), 'Great');
  assert.equal(moodLabel(0), null);
  assert.equal(moodLabel(6), null);
  assert.equal(moodLabel('4'), null);
  assert.equal(moodSummary(4), 'Mood: 4 of 5 (Good)');
  assert.equal(moodSummary(null), 'Mood: —');
});

test('first name falls back when there is no name', () => {
  assert.equal(firstName('Sara Al Balushi'), 'Sara');
  assert.equal(firstName('  Omar  '), 'Omar');
  assert.equal(firstName(''), 'your coach');
  assert.equal(firstName(null, 'them'), 'them');
});

test('saved answers go back under the question they answered', () => {
  const checkin = {
    answers: [
      { question: 'How was your energy?', answer: 'Up and down' },
      { question: 'An old question', answer: 'Old answer' },
    ],
  };
  assert.deepEqual(prefillAnswers(['How did you sleep?', 'How was your energy?'], checkin), ['', 'Up and down']);
  assert.deepEqual(prefillAnswers(DEFAULT_QUESTIONS, null), ['', '', '', '']);
});

test('the form only counts as changed when something real changed', () => {
  const start = initialForm(['Q1', 'Q2'], { mood: 3, answers: [{ question: 'Q1', answer: 'Fine' }], notes: null });
  assert.deepEqual(start, { mood: 3, answers: ['Fine', ''], notes: '' });
  assert.equal(isFormDirty(start, { ...start }), false);
  assert.equal(isFormDirty(start, { ...start, answers: ['Fine  ', ''] }), false);
  assert.equal(isFormDirty(start, { ...start, notes: '   ' }), false);
  assert.equal(isFormDirty(start, { ...start, mood: 4 }), true);
  assert.equal(isFormDirty(start, { ...start, answers: ['Fine', 'More'] }), true);
  assert.equal(isFormDirty(start, { ...start, notes: 'Hi' }), true);
});

test('what gets sent keeps one answer per question, blanks included', () => {
  assert.deepEqual(toCheckinBody({ mood: 5, answers: [' Great ', ''], notes: '  ' }, ['Q1?', 'Q2?']), {
    mood: 5,
    answers: ['Great', ''],
    notes: null,
    questions: ['Q1?', 'Q2?'],
  });
  assert.equal(toCheckinBody({ mood: 2, answers: [], notes: ' Knee ' }).notes, 'Knee');
});

test('blank question rows are found, and edits are noticed', () => {
  assert.deepEqual(blankQuestionRows(['A', ' ', 'B', '']), [1, 3]);
  assert.equal(questionsChanged(['A', 'B'], ['A', 'B ']), false);
  assert.equal(questionsChanged(['A', 'B'], ['B', 'A']), true);
  assert.equal(questionsChanged(['A'], ['A', '']), true);
});

test('weight change reads plainly, with a sign and no false precision', () => {
  assert.equal(formatWeightChange(0.4), '+0.4 kg');
  assert.equal(formatWeightChange(-1.2), '−1.2 kg');
  assert.equal(formatWeightChange(0.01), 'No change');
  assert.equal(formatWeightChange(null), null);
  assert.equal(formatWeightChange('abc'), null);
});

test('habits show "x of y" only when y is known', () => {
  assert.equal(habitsValue(5, 12), '5 of 12');
  assert.equal(habitsValue(3, null), '3');
  assert.equal(habitsValue(null, 7), '0 of 7');
});

test('rate limits are spotted by status or code', () => {
  assert.equal(isRateLimited({ status: 429 }), true);
  assert.equal(isRateLimited({ code: 'RATE_LIMITED' }), true);
  assert.equal(isRateLimited({ status: 400 }), false);
  assert.equal(isRateLimited(null), false);
});
