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
