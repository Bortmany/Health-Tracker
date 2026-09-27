-- Private coach notes: one short note per coach-and-client pairing, written by
-- the coach for their own eyes only. The client never sees it, another coach
-- never sees it, and it is only reachable while the coach's link to that
-- client is active (the routes enforce that — the row itself stays so the
-- pairing can't accidentally pick up a stale note through a fresh link).
-- Each save replaces the old text; no history is kept.
CREATE TABLE coach_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) <= 4000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, client_id)
);

CREATE INDEX coach_notes_coach_id_idx ON coach_notes(coach_id);
