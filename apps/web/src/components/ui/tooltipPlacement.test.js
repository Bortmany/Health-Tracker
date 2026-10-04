import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeTooltip } from './tooltipPlacement.js';

test('a hint sits above and centred when there is room', () => {
  const p = placeTooltip({ left: 200, top: 300, width: 40, bottom: 330 }, 800);
  assert.deepEqual(p, { x: 220, y: 292, above: true });
});

test('a hint drops below when the control is at the top of the screen', () => {
  const p = placeTooltip({ left: 200, top: 10, width: 40, bottom: 40 }, 800);
  assert.equal(p.above, false);
  assert.equal(p.y, 48);
});

test('a hint never runs off either edge of a narrow phone screen', () => {
  const left = placeTooltip({ left: 0, top: 300, width: 20, bottom: 320 }, 360);
  const right = placeTooltip({ left: 340, top: 300, width: 20, bottom: 320 }, 360);
  assert.ok(left.x - 120 >= 8);
  assert.ok(right.x + 120 <= 352);
});
