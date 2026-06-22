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
