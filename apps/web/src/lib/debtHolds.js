import { formatCents, formatDay } from './money.js';

// Turns the server's list of holds into plain rows for the screen, split into
// open and settled. A hold has no coach name (only a hashed email is stored),
// so each one is described by what is owed, since when, and how many ledger
// entries sit behind it. Bad or missing values show "—", never NaN.
export function toHoldRow(hold) {
  const h = hold && typeof hold === 'object' ? hold : {};
  const settled = Boolean(h.settledAt);
  return {
    id: h.id,
    status: settled ? 'Settled' : 'Open',
    settled,
    amountText: formatCents(h.amountCents),
    sinceText: formatDay(h.createdAt),
    settledText: settled ? formatDay(h.settledAt) : null,
    entries: Array.isArray(h.ledgerIds) ? h.ledgerIds.length : 0,
  };
}

export function normalizeDebtHolds(data) {
  const list = Array.isArray(data?.holds) ? data.holds : [];
  const rows = list.filter((h) => h && h.id != null).map(toHoldRow);
  return {
    open: rows.filter((r) => !r.settled),
    settled: rows.filter((r) => r.settled),
  };
}

export function entriesText(count) {
  return count === 1 ? '1 ledger entry' : `${count} ledger entries`;
}
