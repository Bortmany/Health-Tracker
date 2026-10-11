-- 023: the AI plan that adjusts every week (paid accounts).
--
-- * user_plans remembers where the current plan came from ('library' = one of
--   the seeded plans, 'ai' = written by the AI) and the day it was last
--   written or adjusted. An AI plan has no library template, so its name,
--   description, progression rules and phases are kept on the row itself.
-- * ai_plan_adjustments is the saved history of weekly changes, one row per
--   adjustment, shown to the user as "Plan history".
-- * ai_plan_attempts counts every call to the AI (writing a plan or adjusting
--   one) per user per server day, so the daily cap lives in the database and
--   can't be dodged by changing the device's date.
-- * Everyone now gets the full plan: anyone still on a shortened (4-week)
--   library plan is moved onto its full 52 weeks.

ALTER TABLE user_plans
  ADD COLUMN source TEXT NOT NULL DEFAULT 'library' CHECK (source IN ('library', 'ai')),
  ADD COLUMN last_adjusted_on DATE,
  ADD COLUMN ai_name TEXT,
  ADD COLUMN ai_description TEXT,
  ADD COLUMN ai_progression JSONB,
  ADD COLUMN ai_phases JSONB;

CREATE TABLE ai_plan_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  summary TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_plan_adjustments_user_created_idx ON ai_plan_adjustments(user_id, created_at DESC);

CREATE TABLE ai_plan_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempted_on DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('write', 'adjust')),
  succeeded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_plan_attempts_user_day_idx ON ai_plan_attempts(user_id, attempted_on);

-- Every library plan is 52 weeks long (the seeded phases add up to 52), so
-- anyone who was given only the first 4 weeks now has the whole plan.
UPDATE user_plans SET duration_weeks = 52 WHERE duration_weeks < 52;
