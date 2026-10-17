-- A coach who owes Cut money (refunds or chargebacks after they were paid) may
-- delete their account, but cannot register again with the same email until
-- the debt is settled. The email itself is NOT stored: only a keyed hash
-- (HMAC) of the trimmed, lower-cased address, so no personal data is kept.
CREATE TABLE coach_debt_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  -- The commission_ledger rows that make up the debt (the rows stay, detached).
  ledger_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ
);
-- At most one open hold per email.
CREATE UNIQUE INDEX coach_debt_holds_open_email_idx ON coach_debt_holds(email_hash) WHERE settled_at IS NULL;
CREATE INDEX coach_debt_holds_email_idx ON coach_debt_holds(email_hash);
