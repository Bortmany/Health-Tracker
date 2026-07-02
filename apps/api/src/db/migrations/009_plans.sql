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
