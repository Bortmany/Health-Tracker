-- "Become a coach" applications. A signed-in user fills in a short form; the
-- app owner (the one admin account) approves or declines it by hand. Approval
-- is the only path that turns a regular account into a coach.
CREATE TABLE coach_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  credentials TEXT NOT NULL,
  years_coaching INTEGER NOT NULL,
  approach TEXT NOT NULL,
  link TEXT,
  agreed_to_terms BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);

-- One open (pending) application per person at a time, enforced by the database.
CREATE UNIQUE INDEX coach_applications_one_pending_idx ON coach_applications(user_id) WHERE status = 'pending';
-- The admin queue lists pending first, newest first.
CREATE INDEX coach_applications_status_created_idx ON coach_applications(status, created_at DESC);
CREATE INDEX coach_applications_user_id_idx ON coach_applications(user_id);

-- The one account allowed to review applications. Granted once, ever, to the
-- ADMIN_EMAIL account the first time it signs in while no admin exists.
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

-- Revoking a coach ends their client links without deleting them, so the
-- history stays. The status check gains 'revoked' alongside pending/active.
ALTER TABLE coach_clients DROP CONSTRAINT coach_clients_status_check;
ALTER TABLE coach_clients ADD CONSTRAINT coach_clients_status_check CHECK (status IN ('pending', 'active', 'revoked'));

-- A revoked link must not block the same coach and client from linking again
-- later (if the owner re-approves the coach and the client redeems a new
-- invite). Only live links count towards "one link per coach and client".
DROP INDEX IF EXISTS coach_clients_coach_id_client_id_idx;
CREATE UNIQUE INDEX coach_clients_coach_id_client_id_idx
  ON coach_clients(coach_id, client_id)
  WHERE client_id IS NOT NULL AND status <> 'revoked';
