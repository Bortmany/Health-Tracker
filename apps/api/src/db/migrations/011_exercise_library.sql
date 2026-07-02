-- Global, read-only reference data: not user-scoped, no user_id column.
CREATE TABLE exercise_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  muscle_group TEXT,
  equipment TEXT,
  instructions TEXT
);
