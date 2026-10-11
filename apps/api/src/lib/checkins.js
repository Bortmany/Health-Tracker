// Weekly check-ins: the shared pieces used by the student routes
// (routes/checkins.js), the coach routes (routes/coach.js) and the data export.

import { pool } from '../db/pool.js';

// Every coach starts from these four questions. The same list is seeded for
// existing coaches in migration 024_checkins.sql — keep the two in step.
export const DEFAULT_CHECKIN_QUESTIONS = Object.freeze([
  'How did your training feel this week?',
  'How was your energy?',
  'How did you sleep?',
  'Is there anything your coach should know?',
]);

export const MAX_CHECKIN_QUESTIONS = 8;
export const MAX_QUESTION_LENGTH = 140;
export const MAX_ANSWER_LENGTH = 500;
export const MAX_CHECKIN_NOTES_LENGTH = 1000;

// The columns every check-in read selects (week_start as plain YYYY-MM-DD).
export const CHECKIN_COLUMNS =
  'id, week_start::text AS week_start, mood, answers, notes, submitted_at, updated_at';

export function toPublicCheckin(row) {
  return {
    id: row.id,
    weekStart: row.week_start,
    mood: row.mood,
    answers: Array.isArray(row.answers)
      ? row.answers.map((a) => ({ question: String(a.question ?? ''), answer: String(a.answer ?? '') }))
      : [],
    notes: row.notes ?? null,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

// A coach's current questions. A coach with no saved list yet (promoted after
// the migration ran) gets the four defaults saved on first read.
export async function loadCoachQuestions(coachId, db = pool) {
  await db.query(
    `INSERT INTO checkin_templates (coach_id, questions)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (coach_id) DO NOTHING`,
    [coachId, JSON.stringify(DEFAULT_CHECKIN_QUESTIONS)]
  );
  const { rows } = await db.query('SELECT questions FROM checkin_templates WHERE coach_id = $1', [coachId]);
  const questions = rows[0]?.questions;
  return Array.isArray(questions) ? questions.map(String) : [...DEFAULT_CHECKIN_QUESTIONS];
}
