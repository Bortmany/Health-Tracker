// Run under both TZ=Asia/Muscat and TZ=UTC: timestamps are built on the local
// clock, so the expected day is the same everywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aiPlanErrorView,
  describeChange,
  dismissNotice,
  formatHistoryDate,
  isNoticeDismissed,
  nextAdjustmentLabel,
  noticeChangeLines,
  noticeDismissKey,
  shouldShowNotice,
  shouldShowWaiting,
} from './aiPlan.js';

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

const plan = {
  adjustedThisWeek: true,
  latestAdjustment: { id: 'a1', weekNumber: 3, summary: 'Added a set to squats.', changes: [] },
};

test('the notice shows when the plan adjusted this week', () => {
  assert.equal(shouldShowNotice(plan, fakeStorage()), true);
});

test('the notice hides once dismissed, but a new adjustment shows again', () => {
  const storage = fakeStorage();
  dismissNotice(storage, 'a1');
  assert.equal(isNoticeDismissed(storage, 'a1'), true);
  assert.equal(shouldShowNotice(plan, storage), false);
  const next = { ...plan, latestAdjustment: { ...plan.latestAdjustment, id: 'a2' } };
  assert.equal(shouldShowNotice(next, storage), true);
});

test('the dismiss key is per adjustment', () => {
  assert.notEqual(noticeDismissKey('a1'), noticeDismissKey('a2'));
});

test('no notice when the week rolled over or nothing adjusted; no storage still shows it', () => {
  assert.equal(shouldShowNotice({ ...plan, adjustedThisWeek: false }, fakeStorage()), false);
  assert.equal(shouldShowNotice({ ...plan, latestAdjustment: null }, fakeStorage()), false);
  assert.equal(shouldShowNotice(null, fakeStorage()), false);
  assert.equal(shouldShowNotice(plan, null), true);
});

test('history dates read like "12 Oct 2026" and never NaN', () => {
  assert.equal(formatHistoryDate('2026-10-12'), '12 Oct 2026');
  assert.equal(formatHistoryDate(new Date(2026, 9, 12, 23, 30).toISOString()), '12 Oct 2026');
  assert.equal(formatHistoryDate(new Date(2026, 9, 13, 0, 30).toISOString()), '13 Oct 2026');
  assert.equal(formatHistoryDate('2026-02-30'), '—');
  assert.equal(formatHistoryDate('not a date'), '—');
  assert.equal(formatHistoryDate(null), '—');
  assert.equal(formatHistoryDate(''), '—');
});

test('each AI plan refusal maps to the right reaction, keeping the server message', () => {
  const err = (code, message, status) => ({ code, message, status });
  assert.deepEqual(aiPlanErrorView(err('AI_NOT_ENABLED', 'Off.', 503)), { kind: 'notEnabled', message: 'Off.' });
  assert.equal(aiPlanErrorView(err('PAID_PLAN_REQUIRED', 'Upgrade.', 403)).kind, 'lostAccess');
  assert.deepEqual(aiPlanErrorView(err('AI_PLAN_RECENT', 'Next week.', 409)), { kind: 'blocked', message: 'Next week.' });
  assert.deepEqual(aiPlanErrorView(err('AI_DAILY_LIMIT', 'Tomorrow.', 429)), { kind: 'blocked', message: 'Tomorrow.' });
  assert.deepEqual(aiPlanErrorView(err('AI_FAILED', 'Try later.', 502)), { kind: 'failed', message: 'Try later.' });
});

test('a plan change reads as one plain line', () => {
  assert.equal(
    describeChange({ day: 1, exercise: 'Squat', action: 'add', targetSets: 4, targetReps: '8', note: 'legs recovered well' }),
    'Day 1: added Squat, 4 x 8 — legs recovered well'
  );
  assert.equal(
    describeChange({ day: 'Upper A', exercise: 'Dips', action: 'remove', targetSets: 3, targetReps: 10 }),
    'Upper A: removed Dips'
  );
  assert.equal(describeChange({ exercise: 'Row', action: 'change', targetSets: 3, targetReps: '10-12' }), 'Changed Row, 3 x 10-12');
});

test('a change with no exercise, or not an object, is skipped', () => {
  assert.equal(describeChange({ day: 1, action: 'add' }), null);
  assert.equal(describeChange(null), null);
  assert.equal(describeChange('squat'), null);
});

test('fallback wording when the server sent no message, or the network failed', () => {
  assert.match(aiPlanErrorView({ code: 'AI_DAILY_LIMIT', message: 'Request failed', status: 429 }).message, /limit for today/);
  assert.match(aiPlanErrorView(new TypeError('Failed to fetch')).message, /couldn't write your plan/);
});

test('the notice lists at most 3 readable changes', () => {
  const adjustment = {
    changes: [
      { day: 1, exercise: 'Squat', action: 'add', targetSets: 4, targetReps: '8' },
      { exercise: '' },
      { day: 2, exercise: 'Bench Press', action: 'remove' },
      null,
      { day: 3, exercise: 'Row', action: 'change', targetSets: 3, targetReps: 10 },
      { day: 4, exercise: 'Curl', action: 'add', targetSets: 2, targetReps: 12 },
    ],
  };
  assert.deepEqual(noticeChangeLines(adjustment), [
    'Day 1: added Squat, 4 x 8',
    'Day 2: removed Bench Press',
    'Day 3: changed Row, 3 x 10',
  ]);
  assert.deepEqual(noticeChangeLines({ changes: 'oops' }), []);
  assert.deepEqual(noticeChangeLines(null), []);
});

test('the waiting line shows on an AI plan with nothing adjusted this week', () => {
  assert.equal(shouldShowWaiting({ source: 'ai', adjustedThisWeek: false, latestAdjustment: null }), true);
  assert.equal(shouldShowWaiting({ source: 'ai', adjustedThisWeek: false, latestAdjustment: { id: 'a1' } }), true);
  assert.equal(shouldShowWaiting({ source: 'ai', adjustedThisWeek: true, latestAdjustment: { id: 'a1' } }), false);
  assert.equal(shouldShowWaiting({ source: 'library', adjustedThisWeek: false }), false);
  assert.equal(shouldShowWaiting(null), false);
});

test('the next adjustment is 7 days after the last one, on the calendar', () => {
  assert.equal(nextAdjustmentLabel('2026-09-28', '2026-09-30'), '5 Oct 2026');
  // Across a month and year end.
  assert.equal(nextAdjustmentLabel('2026-12-28', '2026-12-29'), '4 Jan 2027');
  // An older server reply with a full timestamp keeps its day.
  assert.equal(nextAdjustmentLabel('2026-09-28T00:00:00.000Z', '2026-09-30'), '5 Oct 2026');
});

test('an overdue adjustment day moves to tomorrow', () => {
  assert.equal(nextAdjustmentLabel('2026-09-01', '2026-09-30'), '1 Oct 2026');
  assert.equal(nextAdjustmentLabel('2026-09-23', '2026-09-30'), '1 Oct 2026');
  // Without a usable today, the plain 7-day date is shown.
  assert.equal(nextAdjustmentLabel('2026-09-01', undefined), '8 Sep 2026');
});

test('a missing or broken last-adjusted date shows a dash', () => {
  assert.equal(nextAdjustmentLabel(null, '2026-09-30'), '—');
  assert.equal(nextAdjustmentLabel('', '2026-09-30'), '—');
  assert.equal(nextAdjustmentLabel('2026-02-30', '2026-09-30'), '—');
  assert.equal(nextAdjustmentLabel('not a date', '2026-09-30'), '—');
});
