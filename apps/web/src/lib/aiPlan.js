// Plain logic behind the AI plan screens, kept free of React so it can be
// tested on its own.
import { addDays, toCalendarDay } from './localDate.js';

// ---- "Your plan adjusted this week" notice ----
// Dismissing it lasts for this browser session only and is remembered per
// adjustment, so a NEW adjustment always shows again. Nothing goes to the server.

export function noticeDismissKey(adjustmentId) {
  return `cut:planNoticeDismissed:${adjustmentId}`;
}

// The browser's sessionStorage, or null where there is none (blocked
// storage, tests) — callers then simply don't remember the dismissal.
export function sessionStore() {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function isNoticeDismissed(storage, adjustmentId) {
  if (!storage || adjustmentId == null) return false;
  try {
    return storage.getItem(noticeDismissKey(adjustmentId)) === '1';
  } catch {
    return false;
  }
}

export function dismissNotice(storage, adjustmentId) {
  if (!storage || adjustmentId == null) return;
  try {
    storage.setItem(noticeDismissKey(adjustmentId), '1');
  } catch {
    // Storage full or blocked: the notice just stays hidden until reload.
  }
}

// Whether the plan card should show the notice at all.
export function shouldShowNotice(plan, storage) {
  const latest = plan?.latestAdjustment;
  if (!plan?.adjustedThisWeek || !latest || !latest.summary) return false;
  return !isNoticeDismissed(storage, latest.id);
}

// ---- Plan history dates ----
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "12 Oct 2026" on this device's clock, or "—" for anything that isn't a
// real date. A plain 'YYYY-MM-DD' day is shown as that day (no time-zone
// slip); a full timestamp is shown as the day it fell on here.
export function formatHistoryDate(value) {
  if (typeof value !== 'string' || value.trim() === '') return '—';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const day = toCalendarDay(trimmed);
    if (!day) return '—';
    const [y, m, d] = day.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// ---- One change inside an adjustment ----
// { day, exercise, action: 'add'|'remove'|'change', targetSets, targetReps, note }
// -> "Day 1: added Squat, 4 x 8 — legs recovered well". Returns null when
// there's nothing sensible to say, so the row is simply skipped.
const ACTION_WORDS = { add: 'added', remove: 'removed', change: 'changed' };

export function describeChange(change) {
  if (!change || typeof change !== 'object') return null;
  const exercise = typeof change.exercise === 'string' ? change.exercise.trim() : '';
  if (!exercise) return null;
  const verb = ACTION_WORDS[change.action] ?? 'changed';
  const day = typeof change.day === 'string' || typeof change.day === 'number' ? String(change.day).trim() : '';
  const dayLabel = day === '' ? '' : /^\d+$/.test(day) ? `Day ${day}: ` : `${day}: `;
  const sets = Number.isFinite(change.targetSets) ? change.targetSets : null;
  const reps =
    typeof change.targetReps === 'number' || (typeof change.targetReps === 'string' && change.targetReps.trim())
      ? String(change.targetReps).trim()
      : null;
  const target = change.action !== 'remove' && sets != null && reps ? `, ${sets} x ${reps}` : '';
  const note = typeof change.note === 'string' && change.note.trim() ? ` — ${change.note.trim()}` : '';
  const text = `${dayLabel}${verb} ${exercise}${target}${note}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---- The notice's short list of changes ----
// Up to `max` readable lines from an adjustment's changes; unreadable ones
// are skipped, so an odd reply shows fewer lines rather than a broken one.
export function noticeChangeLines(adjustment, max = 3) {
  const changes = Array.isArray(adjustment?.changes) ? adjustment.changes : [];
  return changes.map(describeChange).filter(Boolean).slice(0, max);
}

// ---- "Your plan adjusts on ..." waiting line ----
// Shown on an AI plan when there's no adjustment to show this week.
export function shouldShowWaiting(plan) {
  if (plan?.source !== 'ai') return false;
  return !(plan.adjustedThisWeek && plan.latestAdjustment);
}

// The day the plan next adjusts: 7 days after it was last written or
// adjusted. If that day has already passed (e.g. today's AI limit was hit),
// it's the next day it can run — tomorrow. Formatted "7 Oct 2026", or "—"
// when the date is missing or not a real day.
export function nextAdjustmentLabel(lastAdjustedOn, today) {
  const last = toCalendarDay(lastAdjustedOn);
  if (!last) return '—';
  let next = addDays(last, 7);
  const day = toCalendarDay(today);
  if (day && next <= day) next = addDays(day, 1);
  return formatHistoryDate(next);
}

// ---- "Get my AI plan" errors ----
// How the screen reacts to each refusal from POST /api/plans/ai. The server's
// own message is shown as-is; the fallbacks cover a missing one.
//   notEnabled — AI switched off: disable the button, quiet note.
//   lostAccess — no longer paid: refresh the account, show the upgrade card.
//   blocked    — already done this week / today's limit: quiet note, button
//                stays disabled until the page reloads.
//   failed     — anything else: red error, button can be tried again.
export function aiPlanErrorView(error) {
  const code = error?.code;
  // Only trust a message that came from the server (it has a status); a
  // network failure's own text ("Failed to fetch") means nothing to people.
  const serverMessage =
    error?.status && typeof error.message === 'string' && error.message !== 'Request failed'
      ? error.message
      : null;
  switch (code) {
    case 'AI_NOT_ENABLED':
      return { kind: 'notEnabled', message: serverMessage ?? "The AI plan isn't switched on yet." };
    case 'PAID_PLAN_REQUIRED':
      return { kind: 'lostAccess', message: null };
    case 'AI_PLAN_RECENT':
      return {
        kind: 'blocked',
        message: serverMessage ?? 'You already got your AI plan this week. Check back next week.',
      };
    case 'AI_DAILY_LIMIT':
      return { kind: 'blocked', message: serverMessage ?? "That's the limit for today. Try again tomorrow." };
    default:
      return {
        kind: 'failed',
        message:
          serverMessage ?? "We couldn't write your plan just now. Your plan is unchanged — try again in a bit.",
      };
  }
}
