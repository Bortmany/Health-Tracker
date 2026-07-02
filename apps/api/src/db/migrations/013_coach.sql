-- Coach accounts: a coach role, coach-authored programs, and coach/client
-- links established via a redeemable invite code.

ALTER TABLE users
  ADD COLUMN role TEXT NOT NULL DEFAULT 'consumer' CHECK (role IN ('consumer', 'coach'));

ALTER TABLE programs
  ADD COLUMN created_by_coach_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- A row starts pending (client_id NULL, invite_code set) when a coach
-- generates an invite. A client redeems the code, which fills in client_id
-- and flips status to active. A coach can have many clients; a client has
-- at most one active coach (enforced at the application layer).
CREATE TABLE coach_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  invite_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX coach_clients_coach_id_idx ON coach_clients(coach_id);
CREATE UNIQUE INDEX coach_clients_coach_id_client_id_idx ON coach_clients(coach_id, client_id) WHERE client_id IS NOT NULL;
