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
