// Plain rules for the coach-student message thread (both sides). No React
// here, so each rule has a small test next to it (messages.test.js).

import { addDays, dayOfMoment, formatShortDay, localToday } from './localDate.js';

export const MESSAGE_MAX = 2000;
export const MESSAGE_COUNTER_FROM = 1800;
// Messages from one person within this many minutes form one "run", with a
// single time printed under its last bubble.
export const RUN_GAP_MINUTES = 5;

function pad(n) {
  return String(n).padStart(2, '0');
}

function toTime(value) {
  if (typeof value !== 'string') return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

// "3:42 PM" on this device's clock; '' when the moment can't be read.
export function formatTime(value) {
  const t = toTime(value);
  if (t == null) return '';
  const d = new Date(t);
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

// The divider label for a day: "Today", "Yesterday", then "8 Sept".
export function dayLabel(day, today = localToday()) {
  if (!day) return '—';
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  return formatShortDay(day, today);
}

// What the screen shows: the server's messages, then any the server has
// confirmed but a slower poll hasn't brought back yet, then the ones still
// sending or failed (always last, in the order they were written).
export function mergeThread(serverMessages, confirmed = [], outbox = []) {
  const server = Array.isArray(serverMessages) ? serverMessages : [];
  const seen = new Set(server.map((m) => m.id));
  const extra = confirmed.filter((m) => m && !seen.has(m.id));
  return [...server, ...extra, ...outbox];
}

// The confirmed messages still worth keeping locally (the server's list
// doesn't carry them yet).
export function pruneConfirmed(serverMessages, confirmed) {
  const seen = new Set((Array.isArray(serverMessages) ? serverMessages : []).map((m) => m.id));
  return confirmed.filter((m) => !seen.has(m.id));
}

// The newest message from the other person that this side hasn't read yet,
// or null. A new id here means the thread should be marked read again.
export function latestUnreadFromOther(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && !m.mine && !m.readAt && !m.status) return m.id ?? null;
  }
  return null;
}

// The line under my latest message only: "Sent", or "Seen 3:45 PM" once the
// other person has read it. Nothing while it is still sending or failed.
export function receiptLabel(message) {
  if (!message || message.status) return null;
  if (message.readAt) {
    const time = formatTime(message.readAt);
    return time ? `Seen ${time}` : 'Seen';
  }
  return 'Sent';
}

// Turns the flat list into what the screen draws: a divider at the start of
// each day, each bubble, the time under the last bubble of each run, and the
// Sent/Seen line under my latest message.
export function buildThreadItems(messages, today = localToday()) {
  const list = Array.isArray(messages) ? messages : [];
  let latestMineIndex = -1;
  list.forEach((m, i) => {
    if (m.mine) latestMineIndex = i;
  });

  const items = [];
  let lastDay = null;
  list.forEach((m, i) => {
    const day = dayOfMoment(m.createdAt);
    if (day !== lastDay) {
      items.push({ type: 'day', key: `day-${day ?? i}`, label: dayLabel(day, today) });
      lastDay = day;
    }
    const next = list[i + 1];
    const t = toTime(m.createdAt);
    const nt = next ? toTime(next.createdAt) : null;
    const endsRun =
      !next ||
      Boolean(next.mine) !== Boolean(m.mine) ||
      dayOfMoment(next.createdAt) !== day ||
      t == null ||
      nt == null ||
      nt - t > RUN_GAP_MINUTES * 60 * 1000;
    items.push({
      type: 'message',
      key: m.id ?? m.tempId,
      message: m,
      time: endsRun && !m.status ? formatTime(m.createdAt) : '',
      receipt: i === latestMineIndex ? receiptLabel(m) : null,
    });
  });
  return items;
}

// "1,950 / 2,000" once the message is nearly full; null before that.
export function counterText(length) {
  if (length < MESSAGE_COUNTER_FROM) return null;
  return `${length.toLocaleString('en-US')} / ${MESSAGE_MAX.toLocaleString('en-US')}`;
}

export function isAtLimit(length) {
  return length >= MESSAGE_MAX;
}

// Something other than spaces, and within the limit.
export function canSend(text) {
  return typeof text === 'string' && text.trim().length > 0 && text.length <= MESSAGE_MAX;
}

// What went wrong with a send, so the screen can pick the right words:
// 'ended' (the coaching link is over), 'rateLimited', 'tooLong', or 'failed'
// (anything else: the bubble offers "Tap to try again").
export function sendErrorKind(error) {
  if (error?.status === 404 || error?.code === 'NOT_FOUND') return 'ended';
  if (error?.status === 429 || error?.code === 'RATE_LIMITED') return 'rateLimited';
  if (error?.status === 400 && /2,000/.test(error?.message ?? '')) return 'tooLong';
  return 'failed';
}

// A thread answer of 404 means the coaching connection has ended.
export function isLinkEnded(error) {
  return error?.status === 404;
}
