import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ariaProps } from './ariaProps.js';

test('only aria-* attributes pass through', () => {
  assert.deepEqual(ariaProps({ 'aria-label': 'Dismiss', 'aria-expanded': false, onMouseDown: () => {}, style: {} }), {
    'aria-label': 'Dismiss',
    'aria-expanded': false,
  });
  assert.deepEqual(ariaProps({}), {});
});
