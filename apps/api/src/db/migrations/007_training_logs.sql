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
-- Indexed for the "most recent prior entry" lookup, which filters by name
-- per user and needs to join back to training_logs for the date.
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
