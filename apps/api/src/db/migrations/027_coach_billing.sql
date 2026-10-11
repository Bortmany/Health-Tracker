-- Coach money (Oct 2026, spec Agents/docs/specs/cut/coach-billing.md).
-- Additive only: nothing here changes or drops existing data.
-- The older customer-reference column from migration 018 stays where it is, unused.

-- The coach's own monthly price for students, in whole cents. Empty until the
-- coach sets one. The database refuses anything outside $10 to $500 as well as
-- the API doing so.
ALTER TABLE coach_profiles
  ADD COLUMN price_cents INTEGER
  CHECK (price_cents IS NULL OR price_cents BETWEEN 1000 AND 50000);

-- A neutral name for "the payment company's id for this person" (the old
-- column was named after the previous provider).
ALTER TABLE users ADD COLUMN provider_customer_id TEXT;
CREATE INDEX users_provider_customer_id_idx ON users(provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;

-- A new link state: the coach has accepted the student but the student has not
-- paid yet. The link only becomes 'active' when a verified payment message
-- arrives from the payment company.
ALTER TABLE coach_clients DROP CONSTRAINT coach_clients_status_check;
ALTER TABLE coach_clients ADD CONSTRAINT coach_clients_status_check
  CHECK (status IN ('pending', 'requested', 'pending_payment', 'active', 'declined', 'ended', 'revoked'));

-- One row per coach: the one-off startup fee, the payment company's account
-- for the coach, and whether their identity check passed.
CREATE TABLE coach_subscriptions (
  coach_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  startup_fee_paid_at TIMESTAMPTZ,
  startup_fee_payment_id TEXT,
  provider_account_id TEXT,
  identity_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coach_subscriptions_provider_account_id_idx ON coach_subscriptions(provider_account_id)
  WHERE provider_account_id IS NOT NULL;

-- Each paying subscription: the AI plan (no coach link) or one coach.
CREATE TABLE student_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_client_id UUID REFERENCES coach_clients(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ai_plan', 'coach')),
  interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  provider_subscription_id TEXT UNIQUE,
  provider_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'ended')),
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX student_subscriptions_user_id_idx ON student_subscriptions(user_id);
-- At most one live AI plan per person, and one live subscription per coaching link.
CREATE UNIQUE INDEX student_subscriptions_one_live_ai_idx ON student_subscriptions(user_id)
  WHERE kind = 'ai_plan' AND status <> 'ended';
CREATE UNIQUE INDEX student_subscriptions_one_live_per_link_idx ON student_subscriptions(coach_client_id)
  WHERE kind = 'coach' AND status <> 'ended';

-- Payouts to coaches. A row is created BEFORE the money is sent; its id is the
-- provider's idempotency key, so a retry can never pay twice.
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  provider_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payouts_coach_id_created_at_idx ON payouts(coach_id, created_at DESC);
CREATE INDEX payouts_created_at_idx ON payouts(created_at DESC);

-- The money ledger. One row per payment, refund or chargeback, written exactly
-- once: source_ref is UNIQUE and every insert is ON CONFLICT DO NOTHING.
-- Whole cents only. Refunds and chargebacks are NEGATIVE rows.
CREATE TABLE commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  student_id UUID REFERENCES users(id) ON DELETE SET NULL,
  gross_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL,
  coach_cents INTEGER NOT NULL,
  -- Cut's rate in basis points (1500 = 15%), stored so history never changes.
  rate_bps INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  source_ref TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('payment', 'refund', 'chargeback')),
  -- Which payment a refund or chargeback undoes.
  original_ref TEXT,
  -- 'provider' = the payment company pays the coach directly (Method A);
  -- 'cut' = Cut collects and pays the coach out (Method B).
  settled_by TEXT NOT NULL CHECK (settled_by IN ('provider', 'cut')),
  payout_id UUID REFERENCES payouts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT commission_ledger_split_check CHECK (gross_cents = commission_cents + coach_cents),
  CONSTRAINT commission_ledger_sign_check CHECK (
    (kind = 'payment' AND gross_cents >= 0 AND commission_cents >= 0 AND coach_cents >= 0)
    OR (kind <> 'payment' AND gross_cents <= 0 AND commission_cents <= 0 AND coach_cents <= 0)
  )
);
CREATE INDEX commission_ledger_coach_id_created_at_idx ON commission_ledger(coach_id, created_at DESC);
-- What is still owed to a coach: unpaid rows Cut collected.
CREATE INDEX commission_ledger_unpaid_idx ON commission_ledger(coach_id)
  WHERE settled_by = 'cut' AND payout_id IS NULL;

-- Webhook messages already handled (by the provider's event id), so a repeat
-- delivery is recognised and changes nothing.
CREATE TABLE billing_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Password reset: only a SHA-256 hash of the emailed token is stored.
CREATE TABLE password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX password_resets_user_id_idx ON password_resets(user_id);
