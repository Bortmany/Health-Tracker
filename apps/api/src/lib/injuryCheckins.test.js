import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeCheckin, normalizeCheckins } from './injuryCheckins.js';

test('clamps pain scores into 0-10 and rounds', () => {
  const result = normalizeCheckin({ injuryId: 'a', painPre: 13, painDuring: -4, painPost: 6.6 });
  assert.equal(result.painPre, 10);
  assert.equal(result.painDuring, 0);
  assert.equal(result.painPost, 7);
});

test('treats missing or empty pain values as null rather than 0', () => {
  const result = normalizeCheckin({ injuryId: 'a', painPre: '', painDuring: undefined, painPost: null });
  assert.equal(result.painPre, null);
  assert.equal(result.painDuring, null);
  assert.equal(result.painPost, null);
});

test('coerces swelling and canTrainTomorrow to booleans, preserving null', () => {
  assert.equal(normalizeCheckin({ injuryId: 'a', swelling: 1 }).swelling, true);
  assert.equal(normalizeCheckin({ injuryId: 'a', swelling: 0 }).swelling, false);
  assert.equal(normalizeCheckin({ injuryId: 'a', swelling: null }).swelling, null);
});

test('normalizeCheckins drops entries without an injuryId', () => {
  const result = normalizeCheckins([{ injuryId: 'a', painPre: 5 }, { painPre: 9 }, null]);
  assert.equal(result.length, 1);
  assert.equal(result[0].injuryId, 'a');
});
