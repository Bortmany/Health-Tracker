-- Always-current full schema dump. Regenerate after each migration.
-- Generated from apps/api/src/db/migrations/*.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  start_weight NUMERIC,
  target_weight NUMERIC,
  target_date DATE,
  height NUMERIC,
  age INTEGER,
  step_goal INTEGER,
  sleep_goal NUMERIC
);

CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ
);

CREATE INDEX habits_user_id_idx ON habits(user_id);

CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  default_duration_minutes INTEGER,
  icon TEXT
);

CREATE INDEX activities_user_id_idx ON activities(user_id);

CREATE TABLE injuries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX injuries_user_id_idx ON injuries(user_id);

CREATE TABLE daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight NUMERIC,
  waist NUMERIC,
  sleep NUMERIC,
  hrv NUMERIC,
  recovery NUMERIC,
  strain NUMERIC,
  steps INTEGER,
  calories INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX daily_logs_user_id_date_idx ON daily_logs(user_id, date);

CREATE TABLE daily_log_habits (
  daily_log_id UUID NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (daily_log_id, habit_id)
);

CREATE TABLE daily_log_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id UUID NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  name TEXT,
  duration_minutes INTEGER
);
-- Note: the original CHECK (activity_id IS NOT NULL OR name IS NOT NULL) was
-- dropped in 005_relax_daily_log_activities_check.sql — it broke on
-- cascading deletes that bypass the app-level name backfill.

CREATE INDEX daily_log_activities_daily_log_id_idx ON daily_log_activities(daily_log_id);

CREATE TABLE daily_log_injury_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id UUID NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  injury_id UUID NOT NULL REFERENCES injuries(id) ON DELETE CASCADE,
  pain_pre INTEGER,
  pain_during INTEGER,
  pain_post INTEGER,
  swelling BOOLEAN,
  can_train_tomorrow BOOLEAN
);

CREATE INDEX daily_log_injury_checkins_daily_log_id_idx ON daily_log_injury_checkins(daily_log_id);

CREATE TABLE programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX programs_user_id_idx ON programs(user_id);

CREATE TABLE program_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX program_days_program_id_idx ON program_days(program_id);

CREATE TABLE program_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_day_id UUID NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_sets INTEGER,
  target_reps INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX program_exercises_program_day_id_idx ON program_exercises(program_day_id);

CREATE TABLE training_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  program_id UUID REFERENCES programs(id) ON DELETE SET NULL,
  program_day_id UUID REFERENCES program_days(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One training session per user per day (added in 016). Lets the save upsert
  -- instead of storing a duplicate when "Save" is tapped twice.
  CONSTRAINT training_logs_user_id_date_key UNIQUE (user_id, date)
);

CREATE INDEX training_logs_user_id_date_idx ON training_logs(user_id, date);

CREATE TABLE training_log_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_log_id UUID NOT NULL REFERENCES training_logs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX training_log_exercises_training_log_id_idx ON training_log_exercises(training_log_id);
CREATE INDEX training_log_exercises_name_idx ON training_log_exercises(name);

CREATE TABLE training_log_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_log_exercise_id UUID NOT NULL REFERENCES training_log_exercises(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  weight NUMERIC,
  reps INTEGER,
  rpe NUMERIC
);

CREATE INDEX training_log_sets_exercise_id_idx ON training_log_sets(training_log_exercise_id);

CREATE TABLE nutrition_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  calories INTEGER,
  protein NUMERIC,
  carbs NUMERIC,
  fat NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX nutrition_logs_user_id_date_idx ON nutrition_logs(user_id, date);

CREATE TABLE nutrition_log_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nutrition_log_id UUID NOT NULL REFERENCES nutrition_logs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  calories INTEGER,
  protein NUMERIC,
  carbs NUMERIC,
  fat NUMERIC,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX nutrition_log_meals_nutrition_log_id_idx ON nutrition_log_meals(nutrition_log_id);
-- Curated workout plans: account tier, quiz answers, the global template
-- library, and the user's adopted plan.

ALTER TABLE users
  ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'premium'));

ALTER TABLE user_settings
  ADD COLUMN experience_level TEXT CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  ADD COLUMN training_goal TEXT CHECK (training_goal IN ('calisthenics', 'powerlifting', 'cardio', 'hypertrophy', 'general')),
  ADD COLUMN equipment TEXT CHECK (equipment IN ('none', 'minimal', 'full_gym')),
  ADD COLUMN days_per_week INTEGER;

CREATE TABLE plan_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  goal TEXT NOT NULL CHECK (goal IN ('calisthenics', 'powerlifting', 'cardio', 'hypertrophy', 'general')),
  experience TEXT NOT NULL CHECK (experience IN ('beginner', 'intermediate', 'advanced')),
  equipment TEXT NOT NULL CHECK (equipment IN ('none', 'minimal', 'full_gym')),
  days_per_week INTEGER NOT NULL,
  min_age INTEGER,
  max_age INTEGER,
  -- How a coach runs the block week to week, e.g.
  -- {"type":"weight","weightPct":2.5,"deloadEveryWeeks":4} or
  -- {"type":"reps","repStep":1,"deloadEveryWeeks":4} or
  -- {"type":"time","minutesStep":2}
  progression JSONB NOT NULL DEFAULT '{}',
  -- Year-long periodization for premium, e.g.
  -- [{"name":"Foundation","weeks":8,"focus":"technique and consistency"}, ...]
  phases JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE plan_template_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_template_id UUID NOT NULL REFERENCES plan_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX plan_template_days_template_id_idx ON plan_template_days(plan_template_id);

CREATE TABLE plan_template_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_template_day_id UUID NOT NULL REFERENCES plan_template_days(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_sets INTEGER,
  target_reps INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX plan_template_exercises_day_id_idx ON plan_template_exercises(plan_template_day_id);

-- One active plan per user; adopting a new plan replaces it.
CREATE TABLE user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_template_id UUID REFERENCES plan_templates(id) ON DELETE SET NULL,
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  duration_weeks INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed data: 010_plan_seed.sql inserts 14 curated plan templates
-- (49 days, 213 exercises) into the plan_template tables.

-- Global, read-only reference data: not user-scoped, no user_id column.
CREATE TABLE exercise_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  muscle_group TEXT,
  equipment TEXT,
  instructions TEXT
);

-- Coach accounts: a coach role, coach-authored programs, and coach/client
-- links established via a redeemable invite code.

ALTER TABLE users
  ADD COLUMN role TEXT NOT NULL DEFAULT 'consumer' CHECK (role IN ('consumer', 'coach'));

ALTER TABLE programs
  ADD COLUMN created_by_coach_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- A row starts pending (client_id NULL, invite_code set) when a coach
-- generates an invite. A client redeems the code, which fills in client_id
-- and flips status to active. A coach can have many clients; a client has
-- at most one active coach (enforced at the application layer).
CREATE TABLE coach_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  invite_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX coach_clients_coach_id_idx ON coach_clients(coach_id);
CREATE UNIQUE INDEX coach_clients_coach_id_client_id_idx ON coach_clients(coach_id, client_id) WHERE client_id IS NOT NULL;

-- 014: one active coach per client, enforced by the database
CREATE UNIQUE INDEX coach_clients_one_active_coach_idx ON coach_clients(client_id) WHERE status = 'active';

-- 015: billing
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;

-- 017: server-side session revocation — the account's token version. Every
-- login token is stamped with this value; logging out or deleting the account
-- bumps it, which invalidates any token signed with the old value.
ALTER TABLE users
  ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

-- 018: Paddle replaces Stripe as the payment provider. Nobody has paid yet —
-- the Stripe column was always empty — so it is dropped rather than copied
-- across, and the Paddle customer reference takes its place.
ALTER TABLE users DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE users ADD COLUMN paddle_customer_id TEXT;

-- 019: "Become a coach" applications, reviewed by the one admin account
-- (ADMIN_EMAIL, granted once, ever). Revoking a coach marks their client
-- links 'revoked' instead of deleting them.
CREATE TABLE coach_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  credentials TEXT NOT NULL,
  years_coaching INTEGER NOT NULL,
  approach TEXT NOT NULL,
  link TEXT,
  agreed_to_terms BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX coach_applications_one_pending_idx ON coach_applications(user_id) WHERE status = 'pending';
CREATE INDEX coach_applications_status_created_idx ON coach_applications(status, created_at DESC);
CREATE INDEX coach_applications_user_id_idx ON coach_applications(user_id);
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE coach_clients DROP CONSTRAINT coach_clients_status_check;
ALTER TABLE coach_clients ADD CONSTRAINT coach_clients_status_check CHECK (status IN ('pending', 'active', 'revoked'));
-- 019 (continued): only live links count towards one-link-per-coach-and-client.
DROP INDEX IF EXISTS coach_clients_coach_id_client_id_idx;
CREATE UNIQUE INDEX coach_clients_coach_id_client_id_idx
  ON coach_clients(coach_id, client_id)
  WHERE client_id IS NOT NULL AND status <> 'revoked';

-- 020: coach profiles (public directory + referral links), student requests,
-- coach invites by email, and links that end instead of being deleted.
CREATE TABLE coach_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  headline TEXT,
  bio TEXT,
  specialties TEXT[] NOT NULL DEFAULT '{}',
  accepting_clients BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT false,
  referral_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coach_profiles_specialties_check CHECK (
    specialties <@ ARRAY['fat-loss', 'muscle-gain', 'beginners', 'strength', 'running',
                         'injury-safe', 'nutrition', 'womens-training', 'over-40', 'online-only']::text[]
  )
);
CREATE INDEX coach_profiles_is_public_idx ON coach_profiles(is_public);
ALTER TABLE coach_clients DROP CONSTRAINT coach_clients_status_check;
ALTER TABLE coach_clients ADD CONSTRAINT coach_clients_status_check
  CHECK (status IN ('pending', 'requested', 'active', 'declined', 'ended', 'revoked'));
ALTER TABLE coach_clients ALTER COLUMN invite_code DROP NOT NULL;
ALTER TABLE coach_clients ADD COLUMN requested_by TEXT
  CHECK (requested_by IN ('coach', 'client', 'referral'));
ALTER TABLE coach_clients ADD COLUMN ended_at TIMESTAMPTZ;
ALTER TABLE coach_clients ADD COLUMN invite_email TEXT;
-- 020 (continued): ended/declined links no longer block the same pair from reconnecting.
DROP INDEX coach_clients_coach_id_client_id_idx;
CREATE UNIQUE INDEX coach_clients_coach_id_client_id_idx
  ON coach_clients(coach_id, client_id)
  WHERE client_id IS NOT NULL AND status NOT IN ('revoked', 'ended', 'declined');
ALTER TABLE users ADD COLUMN referred_by_coach_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX users_referred_by_coach_id_idx ON users(referred_by_coach_id);
-- 020 (continued): existing coaches get a profile row (slug = display name + random suffix, random referral code).
INSERT INTO coach_profiles (user_id, slug, referral_code)
SELECT u.id,
       -- Names with no Latin letters or digits (e.g. Arabic names) fall back
       -- to 'coach', matching the app's makeSlug.
       COALESCE(NULLIF(rtrim(left(trim(BOTH '-' FROM regexp_replace(lower(COALESCE(u.display_name, '')), '[^a-z0-9]+', '-', 'g')), 40), '-'), ''), 'coach')
         || '-' || substr(md5(random()::text || u.id::text), 1, 4),
       upper(substr(md5(random()::text || u.id::text), 1, 10))
FROM users u
WHERE u.role = 'coach'
  AND NOT EXISTS (SELECT 1 FROM coach_profiles p WHERE p.user_id = u.id);

-- 021: private coach notes — one per coach-and-client pairing, only the coach can read it,
-- and only while the link is active (enforced by the routes).
CREATE TABLE coach_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) <= 4000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, client_id)
);
CREATE INDEX coach_notes_coach_id_idx ON coach_notes(coach_id);

-- 022: muscle heatmap — which body regions each library exercise works.
-- Values are limited to the 16 region ids the frontend body map can draw.
-- (Migration 022 also ran one UPDATE per seeded exercise to fill these in.)
ALTER TABLE exercise_library
  ADD COLUMN primary_muscles TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN secondary_muscles TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE exercise_library
  ADD CONSTRAINT exercise_library_muscles_valid CHECK (
    primary_muscles <@ ARRAY[
      'chest','front-delts','side-delts','rear-delts','biceps','triceps',
      'forearms','traps','lats','lower-back','abs','obliques','glutes',
      'quads','hamstrings','calves'
    ]::TEXT[]
    AND secondary_muscles <@ ARRAY[
      'chest','front-delts','side-delts','rear-delts','biceps','triceps',
      'forearms','traps','lats','lower-back','abs','obliques','glutes',
      'quads','hamstrings','calves'
    ]::TEXT[]
  );

-- 022 (continued): the 14 seeded workout plans (migration 010) name 49 exercises that aren't in
-- the 50-movement library, so a member following their plan would log them
-- and see a dark map. They get their own muscle tags here (seeded by the migration), kept apart from
-- the library so the library's search and instructions stay unchanged.
CREATE TABLE exercise_muscle_tags (
  name TEXT PRIMARY KEY,
  primary_muscles TEXT[] NOT NULL DEFAULT '{}',
  secondary_muscles TEXT[] NOT NULL DEFAULT '{}',
  CONSTRAINT exercise_muscle_tags_muscles_valid CHECK (
    primary_muscles <@ ARRAY[
      'chest','front-delts','side-delts','rear-delts','biceps','triceps',
      'forearms','traps','lats','lower-back','abs','obliques','glutes',
      'quads','hamstrings','calves'
    ]::TEXT[]
    AND secondary_muscles <@ ARRAY[
      'chest','front-delts','side-delts','rear-delts','biceps','triceps',
      'forearms','traps','lats','lower-back','abs','obliques','glutes',
      'quads','hamstrings','calves'
    ]::TEXT[]
  )
);
CREATE UNIQUE INDEX exercise_muscle_tags_lower_name_idx ON exercise_muscle_tags (LOWER(name));

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

-- Coach-student messages (Oct 2026, spec Agents/docs/specs/cut/coach-tools.md B).
--
-- One plain text thread per coach-student link. Each message belongs to the
-- coach_clients row it was sent on. When a link ends, the row is kept (status
-- 'ended'), so its messages stay in the database but are out of reach: every
-- read and write checks for an ACTIVE link. A later reconnection always makes
-- a NEW coach_clients row, so it starts with an empty thread.
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_client_id UUID NOT NULL REFERENCES coach_clients(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

CREATE INDEX messages_coach_client_id_created_at_idx ON messages(coach_client_id, created_at);

-- Progress photos and body measurements (Oct 2026, spec
-- Agents/docs/specs/cut/coach-tools.md C).
--
-- A photo row holds only a random file key (never the original file name);
-- the image itself lives in storage (see apps/api/src/lib/photoStorage.js).
-- Every photo starts private: a linked coach sees it only once the student
-- turns shared_with_coach on.
CREATE TABLE progress_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taken_on DATE NOT NULL,
  file_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  shared_with_coach BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX progress_photos_user_id_taken_on_idx ON progress_photos(user_id, taken_on DESC);

-- Five optional body measurements on the daily log, in cm, next to waist.
-- Silly values are refused here as well as by the API.
ALTER TABLE daily_logs
  ADD COLUMN chest NUMERIC CHECK (chest IS NULL OR chest BETWEEN 30 AND 250),
  ADD COLUMN arms NUMERIC CHECK (arms IS NULL OR arms BETWEEN 10 AND 100),
  ADD COLUMN hips NUMERIC CHECK (hips IS NULL OR hips BETWEEN 30 AND 250),
  ADD COLUMN thighs NUMERIC CHECK (thighs IS NULL OR thighs BETWEEN 20 AND 150),
  ADD COLUMN neck NUMERIC CHECK (neck IS NULL OR neck BETWEEN 15 AND 80);

-- 027: coach money (startup fee, subscriptions, commission ledger, payouts,
-- webhook de-duplication, password resets). Same DDL as migration 027.
-- Coach money (Oct 2026, spec Agents/docs/specs/cut/coach-billing.md).
-- Additive only: nothing here changes or drops existing data.
-- The older customer-reference column from migration 018 stays where it is, unused.

-- The coach's own monthly price for students, in whole cents. Empty until the
-- coach sets one. The database refuses anything outside $10 to $500 as well as
-- the API doing so.
ALTER TABLE coach_profiles
  ADD COLUMN price_cents INTEGER
  CHECK (price_cents IS NULL OR price_cents BETWEEN 1000 AND 50000);

-- A neutral name for "the payment company's id for this person" (the old
-- column was named after the previous provider).
ALTER TABLE users ADD COLUMN provider_customer_id TEXT;
CREATE INDEX users_provider_customer_id_idx ON users(provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;

-- A new link state: the coach has accepted the student but the student has not
-- paid yet. The link only becomes 'active' when a verified payment message
-- arrives from the payment company.
ALTER TABLE coach_clients DROP CONSTRAINT coach_clients_status_check;
ALTER TABLE coach_clients ADD CONSTRAINT coach_clients_status_check
  CHECK (status IN ('pending', 'requested', 'pending_payment', 'active', 'declined', 'ended', 'revoked'));

-- One row per coach: the one-off startup fee, the payment company's account
-- for the coach, and whether their identity check passed.
CREATE TABLE coach_subscriptions (
  coach_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  startup_fee_paid_at TIMESTAMPTZ,
  startup_fee_payment_id TEXT,
  provider_account_id TEXT,
  identity_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coach_subscriptions_provider_account_id_idx ON coach_subscriptions(provider_account_id)
  WHERE provider_account_id IS NOT NULL;

-- Each paying subscription: the AI plan (no coach link) or one coach.
CREATE TABLE student_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_client_id UUID REFERENCES coach_clients(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ai_plan', 'coach')),
  interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  provider_subscription_id TEXT UNIQUE,
  provider_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'ended')),
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX student_subscriptions_user_id_idx ON student_subscriptions(user_id);
-- At most one live AI plan per person, and one live subscription per coaching link.
CREATE UNIQUE INDEX student_subscriptions_one_live_ai_idx ON student_subscriptions(user_id)
  WHERE kind = 'ai_plan' AND status <> 'ended';
CREATE UNIQUE INDEX student_subscriptions_one_live_per_link_idx ON student_subscriptions(coach_client_id)
  WHERE kind = 'coach' AND status <> 'ended';

-- Payouts to coaches. A row is created BEFORE the money is sent; its id is the
-- provider's idempotency key, so a retry can never pay twice.
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  provider_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payouts_coach_id_created_at_idx ON payouts(coach_id, created_at DESC);
CREATE INDEX payouts_created_at_idx ON payouts(created_at DESC);

-- The money ledger. One row per payment, refund or chargeback, written exactly
-- once: source_ref is UNIQUE and every insert is ON CONFLICT DO NOTHING.
-- Whole cents only. Refunds and chargebacks are NEGATIVE rows.
CREATE TABLE commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  student_id UUID REFERENCES users(id) ON DELETE SET NULL,
  gross_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL,
  coach_cents INTEGER NOT NULL,
  -- Cut's rate in basis points (1500 = 15%), stored so history never changes.
  rate_bps INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  source_ref TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('payment', 'refund', 'chargeback')),
  -- Which payment a refund or chargeback undoes.
  original_ref TEXT,
  -- 'provider' = the payment company pays the coach directly (Method A);
  -- 'cut' = Cut collects and pays the coach out (Method B).
  settled_by TEXT NOT NULL CHECK (settled_by IN ('provider', 'cut')),
  payout_id UUID REFERENCES payouts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT commission_ledger_split_check CHECK (gross_cents = commission_cents + coach_cents),
  CONSTRAINT commission_ledger_sign_check CHECK (
    (kind = 'payment' AND gross_cents >= 0 AND commission_cents >= 0 AND coach_cents >= 0)
    OR (kind <> 'payment' AND gross_cents <= 0 AND commission_cents <= 0 AND coach_cents <= 0)
  )
);
CREATE INDEX commission_ledger_coach_id_created_at_idx ON commission_ledger(coach_id, created_at DESC);
-- What is still owed to a coach: unpaid rows Cut collected.
CREATE INDEX commission_ledger_unpaid_idx ON commission_ledger(coach_id)
  WHERE settled_by = 'cut' AND payout_id IS NULL;

-- Webhook messages already handled (by the provider's event id), so a repeat
-- delivery is recognised and changes nothing.
CREATE TABLE billing_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Password reset: only a SHA-256 hash of the emailed token is stored.
CREATE TABLE password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX password_resets_user_id_idx ON password_resets(user_id);

-- 028: money safety fixes (payout retry details, pending cancels and refunds,
-- dispute-won rows, coach-switch link). Same DDL as migration 028.
-- Money safety fixes (Oct 2026, follow-up to migration 027).
-- Additive only: new columns and tables, and two checks that are loosened (never
-- tightened) so new kinds of rows are allowed. Nothing is dropped or rewritten.

-- Payouts remember WHERE and UNDER WHICH KEY they were first sent, so a retry
-- uses exactly the same account and key and never the coach's current account.
-- 'manual_review' = too old to retry automatically; a person must check with
-- the payment company. `attention` is a short code the owner screen turns into
-- a plain sentence (empty = nothing to flag).
ALTER TABLE payouts ADD COLUMN provider_account_id TEXT;
ALTER TABLE payouts ADD COLUMN idempotency_key TEXT;
ALTER TABLE payouts ADD COLUMN attention TEXT
  CHECK (attention IS NULL OR attention IN ('unconfirmed_reply', 'lookup_failed'));
ALTER TABLE payouts DROP CONSTRAINT payouts_status_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_status_check
  CHECK (status IN ('pending', 'paid', 'failed', 'manual_review'));
-- Payouts made before this migration were sent under their own id.
UPDATE payouts SET idempotency_key = id::text WHERE idempotency_key IS NULL;
UPDATE payouts p SET provider_account_id = cs.provider_account_id
  FROM coach_subscriptions cs
  WHERE cs.coach_id = p.coach_id AND p.provider_account_id IS NULL;

-- Ledger: an owner flag (e.g. a payment in a currency we cannot split), and a
-- new row kind for a dispute the coach WON (positive: gives the share back).
ALTER TABLE commission_ledger ADD COLUMN owner_flag TEXT
  CHECK (owner_flag IS NULL OR owner_flag IN ('non_usd_payment', 'non_usd_reversal'));
ALTER TABLE commission_ledger DROP CONSTRAINT commission_ledger_kind_check;
ALTER TABLE commission_ledger ADD CONSTRAINT commission_ledger_kind_check
  CHECK (kind IN ('payment', 'refund', 'chargeback', 'chargeback_won'));
ALTER TABLE commission_ledger DROP CONSTRAINT commission_ledger_sign_check;
ALTER TABLE commission_ledger ADD CONSTRAINT commission_ledger_sign_check CHECK (
  (kind IN ('payment', 'chargeback_won') AND gross_cents >= 0 AND commission_cents >= 0 AND coach_cents >= 0)
  OR (kind NOT IN ('payment', 'chargeback_won') AND gross_cents <= 0 AND commission_cents <= 0 AND coach_cents <= 0)
);

-- A student who accepted a new coach while still having an old one: the old
-- link is only ended when the new coach's payment really arrives.
ALTER TABLE coach_clients ADD COLUMN replaces_link_id UUID REFERENCES coach_clients(id) ON DELETE SET NULL;

-- Subscriptions the payment company has not yet confirmed as stopped. Kept
-- until the cancel works; retried on the owner's "Pay coaches now" and on the
-- student's next visit to their subscriptions.
CREATE TABLE pending_cancels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_subscription_id TEXT NOT NULL UNIQUE,
  subscription_id UUID REFERENCES student_subscriptions(id) ON DELETE SET NULL,
  reason TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Automatic refunds for payments that cannot be used (the coaching link could
-- not go live, or it was a duplicate). One row per payment; stays 'pending'
-- (and is shown to the owner) until the payment company confirms the refund.
CREATE TABLE pending_refunds (
  provider_payment_id TEXT PRIMARY KEY,
  coach_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount_cents INTEGER,
  currency TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 029: owner note when settling a payout stuck in manual review. Same DDL as migration 029.
-- The owner's short note when they settle a payout stuck in manual review
-- (marked sent or marked failed after checking with the payment company).
-- Additive only: one new nullable column.
ALTER TABLE payouts ADD COLUMN resolution_note TEXT
  CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 300);

-- 030: flag for a payout marked not sent that was actually sent. Same DDL as migration 030.
ALTER TABLE payouts DROP CONSTRAINT payouts_attention_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_attention_check
  CHECK (attention IS NULL OR attention IN ('unconfirmed_reply', 'lookup_failed', 'paid_after_marked_failed'));

-- 031: last re-check of a payout marked not sent. Same DDL as migration 031.
ALTER TABLE payouts ADD COLUMN recheck_at TIMESTAMPTZ;

-- 032: flag for a keyless transfer found near a payout. Same DDL as migration 032.
ALTER TABLE payouts DROP CONSTRAINT payouts_attention_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_attention_check
  CHECK (attention IS NULL OR attention IN ('unconfirmed_reply', 'lookup_failed', 'paid_after_marked_failed', 'keyless_transfer_nearby'));

-- 033: a payout stuck "processing" for days is parked with its own reason. Same DDL as migration 033.
ALTER TABLE payouts DROP CONSTRAINT payouts_attention_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_attention_check
  CHECK (attention IS NULL OR attention IN ('unconfirmed_reply', 'lookup_failed', 'paid_after_marked_failed', 'keyless_transfer_nearby', 'processing_too_long'));
