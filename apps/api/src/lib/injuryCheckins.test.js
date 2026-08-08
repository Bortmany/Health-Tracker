import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeCheckin, normalizeCheckins } from './injuryCheckins.js';

test('accepts whole pain scores in 0-10', () => {
  const result = normalizeCheckin({ injuryId: 'a', painPre: 0, painDuring: 10, painPost: 7 });
  assert.equal(result.painPre, 0);
  assert.equal(result.painDuring, 10);
  assert.equal(result.painPost, 7);
});

test('rounds a fractional pain score instead of rejecting it', () => {
  const result = normalizeCheckin({ injuryId: 'a', painPost: 6.6 });
  assert.equal(result.painPost, 7);
});

test('rejects out-of-range pain scores instead of silently clamping them', () => {
  assert.throws(() => normalizeCheckin({ injuryId: 'a', painPre: 13 }), /between 0 and 10/);
  assert.throws(() => normalizeCheckin({ injuryId: 'a', painDuring: -4 }), /between 0 and 10/);
});

test('rejects a non-numeric pain score instead of silently dropping it', () => {
  assert.throws(() => normalizeCheckin({ injuryId: 'a', painPre: 'lots' }), /must be a number/);
});

test('treats missing or empty pain values as null rather than 0', () => {
  const result = normalizeCheckin({ injuryId: 'a', painPre: '', painDuring: undefined, painPost: null });
  assert.equal(result.painPre, null);
  assert.equal(result.painDuring, null);
  assert.equal(result.painPost, null);
});

test('accepts real booleans for swelling and canTrainTomorrow, preserving null', () => {
  assert.equal(normalizeCheckin({ injuryId: 'a', swelling: true }).swelling, true);
  assert.equal(normalizeCheckin({ injuryId: 'a', swelling: false }).swelling, false);
  assert.equal(normalizeCheckin({ injuryId: 'a', swelling: null }).swelling, null);
});

test('rejects a non-boolean swelling/canTrainTomorrow value instead of silently coercing it', () => {
  assert.throws(() => normalizeCheckin({ injuryId: 'a', swelling: 1 }), /true or false/);
  assert.throws(() => normalizeCheckin({ injuryId: 'a', canTrainTomorrow: 'yes' }), /true or false/);
});

test('normalizeCheckins drops entries without an injuryId', () => {
  const result = normalizeCheckins([{ injuryId: 'a', painPre: 5 }, { painPre: 9 }, null]);
  assert.equal(result.length, 1);
  assert.equal(result[0].injuryId, 'a');
});
