// Plain rules for the weekly check-in screens (student form, coach question
// editor, coach summary). No React here, so each rule has a small test.

export const ANSWER_MAX = 500;
export const ANSWER_COUNTER_FROM = 450;
export const NOTE_MAX = 1000;
export const NOTE_COUNTER_FROM = 900;
export const QUESTION_MAX = 140;
export const QUESTIONS_MAX = 8;
export const QUESTIONS_MIN = 1;

// What "Reset to the standard four" puts back (the same four the server seeds).
export const DEFAULT_QUESTIONS = [
  'How did your training feel this week?',
  'How was your energy?',
  'How did you sleep?',
  'Is there anything your coach should know?',
];

export const MOODS = [
  { value: 1, label: 'Rough' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'OK' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
];

// "Good" for 4; null for anything that isn't a whole number from 1 to 5.
export function moodLabel(mood) {
  return MOODS.find((m) => m.value === mood)?.label ?? null;
}

// "Mood: 4 of 5 (Good)", or "Mood: —" when the value can't be read.
export function moodSummary(mood) {
  const label = moodLabel(mood);
  return label ? `Mood: ${mood} of 5 (${label})` : 'Mood: —';
}

// The first word of a name, for friendly lines ("Tell Sara how..."). Falls
// back to `fallback` when there's no usable name.
export function firstName(name, fallback = 'your coach') {
  const first = typeof name === 'string' ? name.trim().split(/\s+/)[0] : '';
  return first || fallback;
}

// The answers to pre-fill the form with, one per current question. An answer
// is matched to its question by wording (the coach may have reordered or
// changed questions since it was sent); a question with no match starts blank.
export function prefillAnswers(questions, checkin) {
  const saved = Array.isArray(checkin?.answers) ? checkin.answers : [];
  return questions.map((question) => {
    const match = saved.find((a) => a?.question === question);
    return match ? String(match.answer ?? '') : '';
  });
}

// The form's starting point: the saved check-in when there is one, or blanks.
export function initialForm(questions, checkin) {
  return {
    mood: checkin?.mood ?? null,
    answers: prefillAnswers(questions, checkin),
    notes: checkin?.notes ?? '',
  };
}

// True when the form differs from where it started (spaces at the ends
// don't count as a change, since they're trimmed before sending).
export function isFormDirty(start, draft) {
  if (start.mood !== draft.mood) return true;
  if ((start.notes ?? '').trim() !== (draft.notes ?? '').trim()) return true;
  if (start.answers.length !== draft.answers.length) return true;
  return start.answers.some((a, i) => a.trim() !== (draft.answers[i] ?? '').trim());
}

// What the server expects: same number of answers as questions, in order.
export function toCheckinBody(draft) {
  const notes = (draft.notes ?? '').trim();
  return {
    mood: draft.mood,
    answers: draft.answers.map((a) => a.trim().slice(0, ANSWER_MAX)),
    notes: notes === '' ? null : notes.slice(0, NOTE_MAX),
  };
}

// For the coach's question list: the positions of rows that are blank.
export function blankQuestionRows(questions) {
  return questions.reduce((out, q, i) => (q.trim() === '' ? [...out, i] : out), []);
}

// True when the edited list differs from the saved one (ignoring spaces at the ends).
export function questionsChanged(saved, draft) {
  if (saved.length !== draft.length) return true;
  return saved.some((q, i) => q.trim() !== draft[i].trim());
}

// A weight change for the coach's "This week" card: "+0.4 kg", "−1.2 kg"
// (a real minus sign) or "No change". Null when there's nothing to compare.
export function formatWeightChange(change) {
  if (change == null || change === '') return null;
  const n = Number(change);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 10) / 10;
  if (rounded === 0) return 'No change';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)} kg`;
}

// "5 of 12" when the number of possible ticks is known, otherwise just "5".
export function habitsValue(ticked, possible) {
  const done = ticked != null && Number.isFinite(Number(ticked)) ? Number(ticked) : 0;
  return possible != null && Number.isFinite(Number(possible)) ? `${done} of ${Number(possible)}` : String(done);
}

// A 429 from the server, however the error object carries it.
export function isRateLimited(error) {
  return error?.status === 429 || error?.code === 'RATE_LIMITED';
}
