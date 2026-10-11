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
