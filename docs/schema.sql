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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
