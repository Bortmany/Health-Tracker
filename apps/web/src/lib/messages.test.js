// Message thread rules. Every moment is built on the local clock, so these
// pass the same under TZ=Asia/Muscat and TZ=UTC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildThreadItems,
  canSend,
  counterText,
  dayLabel,
  formatTime,
  isAtLimit,
  latestUnreadFromOther,
  mergeThread,
  pruneConfirmed,
  receiptLabel,
  sendErrorKind,
} from './messages.js';

function at(y, m, d, h, min) {
  return new Date(y, m - 1, d, h, min).toISOString();
}

test('formatTime prints a 12-hour clock time on this device', () => {
  assert.equal(formatTime(at(2026, 9, 30, 15, 42)), '3:42 PM');
  assert.equal(formatTime(at(2026, 9, 30, 0, 5)), '12:05 AM');
  assert.equal(formatTime(at(2026, 9, 30, 12, 0)), '12:00 PM');
  assert.equal(formatTime('nonsense'), '');
  assert.equal(formatTime(null), '');
});

test('dayLabel says Today, Yesterday, then the short day', () => {
  assert.equal(dayLabel('2026-09-30', '2026-09-30'), 'Today');
  assert.equal(dayLabel('2026-09-29', '2026-09-30'), 'Yesterday');
  assert.equal(dayLabel('2026-09-08', '2026-09-30'), '8 Sept');
  assert.equal(dayLabel('2025-12-31', '2026-01-01'), 'Yesterday');
  assert.equal(dayLabel(null, '2026-09-30'), '—');
});

test('buildThreadItems adds a divider per day and a time under each run', () => {
  const messages = [
    { id: 'a', mine: false, body: 'hi', createdAt: at(2026, 9, 29, 9, 0), readAt: at(2026, 9, 29, 9, 1) },
    { id: 'b', mine: false, body: 'there', createdAt: at(2026, 9, 29, 9, 2), readAt: null },
    { id: 'c', mine: true, body: 'hello', createdAt: at(2026, 9, 30, 8, 0), readAt: null },
    { id: 'd', mine: true, body: 'again', createdAt: at(2026, 9, 30, 8, 30), readAt: at(2026, 9, 30, 8, 45) },
  ];
  const items = buildThreadItems(messages, '2026-09-30');
  assert.deepEqual(
    items.map((i) => (i.type === 'day' ? `[${i.label}]` : i.key)),
    ['[Yesterday]', 'a', 'b', '[Today]', 'c', 'd']
  );
  const byKey = Object.fromEntries(items.filter((i) => i.type === 'message').map((i) => [i.key, i]));
  // a and b are one run: only the last carries the time.
  assert.equal(byKey.a.time, '');
  assert.equal(byKey.b.time, '9:02 AM');
  // c and d are 30 minutes apart: two runs.
  assert.equal(byKey.c.time, '8:00 AM');
  assert.equal(byKey.d.time, '8:30 AM');
  // Only my latest message gets the Sent/Seen line.
  assert.equal(byKey.c.receipt, null);
  assert.equal(byKey.d.receipt, 'Seen 8:45 AM');
  assert.equal(byKey.a.receipt, null);
});

test('a message still sending gets no time and no receipt', () => {
  const messages = [
    { id: 'c', mine: true, body: 'hello', createdAt: at(2026, 9, 30, 8, 0), readAt: null },
    { tempId: 't1', mine: true, body: 'new', createdAt: at(2026, 9, 30, 8, 1), readAt: null, status: 'sending' },
  ];
  const items = buildThreadItems(messages, '2026-09-30').filter((i) => i.type === 'message');
  assert.equal(items[0].receipt, null);
  assert.equal(items[1].key, 't1');
  assert.equal(items[1].time, '');
  assert.equal(items[1].receipt, null);
});

test('receiptLabel: Sent, then Seen with the time', () => {
  assert.equal(receiptLabel({ mine: true, readAt: null }), 'Sent');
  assert.equal(receiptLabel({ mine: true, readAt: at(2026, 9, 30, 15, 45) }), 'Seen 3:45 PM');
  assert.equal(receiptLabel({ mine: true, status: 'failed' }), null);
  assert.equal(receiptLabel(null), null);
});

test('mergeThread keeps confirmed sends until the server list has them, outbox last', () => {
  const server = [{ id: 'a' }, { id: 'b' }];
  const confirmed = [{ id: 'b' }, { id: 'c' }];
  const outbox = [{ tempId: 't1', status: 'sending' }];
  assert.deepEqual(
    mergeThread(server, confirmed, outbox).map((m) => m.id ?? m.tempId),
    ['a', 'b', 'c', 't1']
  );
  assert.deepEqual(pruneConfirmed(server, confirmed), [{ id: 'c' }]);
  assert.deepEqual(mergeThread(undefined, [], []), []);
});

test('latestUnreadFromOther finds the newest unread message from the other side', () => {
  assert.equal(
    latestUnreadFromOther([
      { id: 'a', mine: false, readAt: null },
      { id: 'b', mine: false, readAt: null },
      { id: 'c', mine: true, readAt: null },
    ]),
    'b'
  );
  assert.equal(latestUnreadFromOther([{ id: 'a', mine: false, readAt: 'x' }, { id: 'b', mine: true, readAt: null }]), null);
  assert.equal(latestUnreadFromOther(undefined), null);
});

test('counter shows from 1,800 and stops at 2,000', () => {
  assert.equal(counterText(1799), null);
  assert.equal(counterText(1800), '1,800 / 2,000');
  assert.equal(counterText(1950), '1,950 / 2,000');
  assert.equal(isAtLimit(1999), false);
  assert.equal(isAtLimit(2000), true);
});

test('canSend needs real text within the limit', () => {
  assert.equal(canSend(''), false);
  assert.equal(canSend('   \n '), false);
  assert.equal(canSend('hi'), true);
  assert.equal(canSend('x'.repeat(2000)), true);
  assert.equal(canSend('x'.repeat(2001)), false);
});

test('sendErrorKind picks the right words for each failure', () => {
  assert.equal(sendErrorKind({ status: 404 }), 'ended');
  assert.equal(sendErrorKind({ status: 429 }), 'rateLimited');
  assert.equal(sendErrorKind({ status: 400, message: 'Messages can be up to 2,000 characters.' }), 'tooLong');
  assert.equal(sendErrorKind({ status: 500 }), 'failed');
  assert.equal(sendErrorKind(new TypeError('Failed to fetch')), 'failed');
});
