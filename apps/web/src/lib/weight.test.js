// Plain-logic tests for the weight box rules (run with `npm test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlankWeight, plainServerMessage, weightError, weightToPayload, WEIGHT_RANGE_MESSAGE } from './weight.js';

test('weightError: 0 and 999 are refused, real weights pass', () => {
  assert.equal(weightError('0'), WEIGHT_RANGE_MESSAGE);
  assert.equal(weightError('999'), WEIGHT_RANGE_MESSAGE);
  assert.equal(weightError('19.9'), WEIGHT_RANGE_MESSAGE);
  assert.equal(weightError('-5'), WEIGHT_RANGE_MESSAGE);
  assert.equal(weightError('20'), null);
  assert.equal(weightError('62.5'), null);
  assert.equal(weightError('400'), null);
  assert.equal(weightError('400.1'), WEIGHT_RANGE_MESSAGE);
});

test('blank and spaces-only weight is "no entry", never 0', () => {
  for (const v of ['', '   ', null, undefined]) {
    assert.equal(isBlankWeight(v), true);
    assert.equal(weightToPayload(v), null);
    assert.equal(weightError(v), null);
  }
  assert.equal(weightToPayload(' 62.5 '), 62.5);
  assert.equal(weightToPayload(70), 70);
});

test('plainServerMessage turns raw server wording into plain words', () => {
  assert.equal(plainServerMessage('weight cannot be negative'), WEIGHT_RANGE_MESSAGE);
  assert.equal(plainServerMessage('displayName must be at least 1 character long'), 'Please enter a name.');
  assert.equal(plainServerMessage('Something specific'), 'Something specific');
  assert.equal(plainServerMessage(undefined), 'Something went wrong. Please try again.');
});
