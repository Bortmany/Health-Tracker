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
  duration_minutes INTEGER,
  CHECK (activity_id IS NOT NULL OR name IS NOT NULL)
);

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
