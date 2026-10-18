import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entriesText, normalizeDebtHolds, toHoldRow } from './debtHolds.js';

test('splits open and settled holds, keeping order', () => {
  const { open, settled } = normalizeDebtHolds({
    holds: [
      { id: 1, amountCents: 1250, ledgerIds: [1, 2], createdAt: '2026-10-01T08:00:00.000Z', settledAt: null },
      { id: 2, amountCents: 500, ledgerIds: [3], createdAt: '2026-09-01', settledAt: '2026-09-20T10:00:00.000Z' },
      { id: 3, amountCents: 100, ledgerIds: [], createdAt: '2026-10-05', settledAt: null },
    ],
  });
  assert.deepEqual(open.map((r) => r.id), [1, 3]);
  assert.deepEqual(settled.map((r) => r.id), [2]);
  assert.equal(open[0].amountText, '$12.50');
  assert.equal(open[0].entries, 2);
  assert.equal(settled[0].status, 'Settled');
});

test('bad dates and amounts show a dash, never NaN', () => {
  const row = toHoldRow({ id: 9, amountCents: 'oops', ledgerIds: null, createdAt: 'not a date', settledAt: null });
  assert.equal(row.sinceText, '—');
  assert.equal(row.amountText, '—');
  assert.equal(row.entries, 0);
  assert.ok(!JSON.stringify(row).includes('NaN'));
});

test('empty or broken replies give empty lists', () => {
  for (const bad of [undefined, null, {}, { holds: 'x' }, { holds: [null] }]) {
    assert.deepEqual(normalizeDebtHolds(bad), { open: [], settled: [] });
  }
});

test('entry count wording', () => {
  assert.equal(entriesText(1), '1 ledger entry');
  assert.equal(entriesText(3), '3 ledger entries');
});
