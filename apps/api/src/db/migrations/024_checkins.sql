-- Weekly check-ins (Oct 2026, spec Agents/docs/specs/cut/coach-tools.md).
--
-- checkin_templates: each coach's own list of check-in questions (1 to 8).
-- Every coach starts from the same four defaults; a coach without a row gets
-- one created the first time their questions are read (the same four live in
-- apps/api/src/lib/checkins.js — keep the two lists in step).
CREATE TABLE checkin_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  questions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO checkin_templates (coach_id, questions)
SELECT id, '["How did your training feel this week?", "How was your energy?", "How did you sleep?", "Is there anything your coach should know?"]'::jsonb
FROM users
WHERE role = 'coach'
ON CONFLICT (coach_id) DO NOTHING;

-- checkins: one per student per week (weeks start on Monday). The questions
-- are copied next to each answer, so later edits to the coach's list never
-- change what a student already sent. coach_id is the coach it was sent to; a
-- coach only sees it while their link to that student is active.
CREATE TABLE checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES users(id) ON DELETE SET NULL,
  week_start DATE NOT NULL,
  mood SMALLINT NOT NULL CHECK (mood BETWEEN 1 AND 5),
  answers JSONB NOT NULL,
  notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX checkins_coach_id_week_start_idx ON checkins(coach_id, week_start);
