import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  CHECKIN_COLUMNS,
  MAX_ANSWER_LENGTH,
  MAX_CHECKIN_NOTES_LENGTH,
  loadCoachQuestions,
  toPublicCheckin,
} from '../lib/checkins.js';
import { resolveToday, weekStartOf } from '../lib/userToday.js';
import { ValidationError } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';

// The student's side of the weekly check-in. A student only ever reads and
// writes their own rows (user_id = the signed-in user). "This week" is the
// Monday-to-Sunday week of the device's own day (?today=YYYY-MM-DD).

const router = Router();

router.use(requireAuth);

const HISTORY_LIMIT = 26;

function invalid(message) {
  return new ValidationError(message, 'VALIDATION_ERROR');
}

// The student's current coach (only an active link counts), or null.
async function findActiveCoach(userId) {
  const { rows } = await pool.query(
    `SELECT cc.coach_id, u.display_name
     FROM coach_clients cc
     JOIN users u ON u.id = cc.coach_id
     WHERE cc.client_id = $1 AND cc.status = 'active'`,
    [userId]
  );
  return rows[0] ?? null;
}

router.get('/current', asyncHandler(async (req, res) => {
  const weekStart = weekStartOf(resolveToday(req.query.today));
  const coach = await findActiveCoach(req.userId);
  if (!coach) {
    return res.json({ hasCoach: false, coachName: null, weekStart, questions: [], checkin: null });
  }

  const questions = await loadCoachQuestions(coach.coach_id);
  // Only a check-in sent to the CURRENT coach counts as this week's; one sent
  // to a previous coach stays in the student's history but not here.
  const { rows } = await pool.query(
    `SELECT ${CHECKIN_COLUMNS} FROM checkins
     WHERE user_id = $1 AND week_start = $2::date AND coach_id = $3`,
    [req.userId, weekStart, coach.coach_id]
  );
  res.json({
    hasCoach: true,
    coachName: coach.display_name,
    weekStart,
    questions,
    checkin: rows[0] ? toPublicCheckin(rows[0]) : null,
  });
}));

// Send (or edit) this week's check-in. There is one per week: sending again in
// the same week replaces the answers and keeps the first sent time.
router.put('/current', asyncHandler(async (req, res) => {
  const weekStart = weekStartOf(resolveToday(req.query.today));
  const { mood, answers, notes, questions: seenQuestions } = req.body ?? {};

  if (!Number.isInteger(mood) || mood < 1 || mood > 5) {
    throw invalid('Pick how your week felt, from 1 to 5.');
  }
  if (!Array.isArray(answers) || answers.some((a) => typeof a !== 'string')) {
    throw invalid('Your answers must be a list of text.');
  }
  const cleanAnswers = answers.map((a) => a.trim());
  if (cleanAnswers.some((a) => [...a].length > MAX_ANSWER_LENGTH)) {
    throw invalid(`Each answer must be no more than ${MAX_ANSWER_LENGTH} characters long.`);
  }
  if (!Array.isArray(seenQuestions) || seenQuestions.some((q) => typeof q !== 'string')) {
    throw invalid('Your form is out of date. Please reload the page and try again.');
  }
  if (notes != null && typeof notes !== 'string') {
    throw invalid('Your note must be text.');
  }
  const cleanNotes = (notes ?? '').trim();
  if ([...cleanNotes].length > MAX_CHECKIN_NOTES_LENGTH) {
    throw invalid(`Your note must be no more than ${MAX_CHECKIN_NOTES_LENGTH} characters long.`);
  }

  const coach = await findActiveCoach(req.userId);
  if (!coach) {
    return res.status(409).json({
      error: { message: 'You need a coach to send a check-in.', code: 'NO_COACH' },
    });
  }

  const questions = await loadCoachQuestions(coach.coach_id);
  // Answers are filed by position, so the form must have been answering the
  // coach's questions as they are right now. If the coach edited them in the
  // meantime, nothing is saved and the student is asked to look again.
  if (seenQuestions.length !== questions.length || seenQuestions.some((q, i) => q !== questions[i])) {
    return res.status(409).json({
      error: {
        message: 'Your coach just changed their questions. Please check the form and send again.',
        code: 'QUESTIONS_CHANGED',
      },
    });
  }
  if (cleanAnswers.length !== questions.length) {
    throw invalid(
      `Your coach's questions have changed. Please answer all ${questions.length} and send again.`
    );
  }
  // Each answer keeps a copy of its question, so later edits to the coach's
  // list never change what was sent.
  const snapshot = questions.map((question, i) => ({ question, answer: cleanAnswers[i] }));

  const { rows } = await pool.query(
    `INSERT INTO checkins (user_id, coach_id, week_start, mood, answers, notes)
     VALUES ($1, $2, $3::date, $4::smallint, $5::jsonb, $6)
     ON CONFLICT (user_id, week_start) DO UPDATE
       SET coach_id = EXCLUDED.coach_id,
           mood = EXCLUDED.mood,
           answers = EXCLUDED.answers,
           notes = EXCLUDED.notes,
           updated_at = now()
     RETURNING ${CHECKIN_COLUMNS}`,
    [req.userId, coach.coach_id, weekStart, mood, JSON.stringify(snapshot), cleanNotes === '' ? null : cleanNotes]
  );
  res.json({ checkin: toPublicCheckin(rows[0]) });
}));

// The student's own check-ins, newest week first — including ones sent to a
// coach they no longer work with.
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${CHECKIN_COLUMNS} FROM checkins
     WHERE user_id = $1
     ORDER BY week_start DESC
     LIMIT ${HISTORY_LIMIT}`,
    [req.userId]
  );
  res.json({ checkins: rows.map(toPublicCheckin) });
}));

export default router;
