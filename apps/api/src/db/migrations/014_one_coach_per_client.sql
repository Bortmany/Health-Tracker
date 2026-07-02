-- Guarantee at the database level that a client can only have one active
-- coach at a time, even if two connections race past the app-level checks.
CREATE UNIQUE INDEX coach_clients_one_active_coach_idx
  ON coach_clients(client_id)
  WHERE status = 'active';
