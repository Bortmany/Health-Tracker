-- Money safety fixes (Oct 2026, follow-up to migration 027).
-- Additive only: new columns and tables, and two checks that are loosened (never
-- tightened) so new kinds of rows are allowed. Nothing is dropped or rewritten.

-- Payouts remember WHERE and UNDER WHICH KEY they were first sent, so a retry
-- uses exactly the same account and key and never the coach's current account.
-- 'manual_review' = too old to retry automatically; a person must check with
-- the payment company. `attention` is a short code the owner screen turns into
-- a plain sentence (empty = nothing to flag).
ALTER TABLE payouts ADD COLUMN provider_account_id TEXT;
ALTER TABLE payouts ADD COLUMN idempotency_key TEXT;
ALTER TABLE payouts ADD COLUMN attention TEXT
  CHECK (attention IS NULL OR attention IN ('unconfirmed_reply', 'lookup_failed'));
ALTER TABLE payouts DROP CONSTRAINT payouts_status_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_status_check
  CHECK (status IN ('pending', 'paid', 'failed', 'manual_review'));
-- Payouts made before this migration were sent under their own id.
UPDATE payouts SET idempotency_key = id::text WHERE idempotency_key IS NULL;
UPDATE payouts p SET provider_account_id = cs.provider_account_id
  FROM coach_subscriptions cs
  WHERE cs.coach_id = p.coach_id AND p.provider_account_id IS NULL;

-- Ledger: an owner flag (e.g. a payment in a currency we cannot split), and a
-- new row kind for a dispute the coach WON (positive: gives the share back).
ALTER TABLE commission_ledger ADD COLUMN owner_flag TEXT
  CHECK (owner_flag IS NULL OR owner_flag IN ('non_usd_payment', 'non_usd_reversal'));
ALTER TABLE commission_ledger DROP CONSTRAINT commission_ledger_kind_check;
ALTER TABLE commission_ledger ADD CONSTRAINT commission_ledger_kind_check
  CHECK (kind IN ('payment', 'refund', 'chargeback', 'chargeback_won'));
ALTER TABLE commission_ledger DROP CONSTRAINT commission_ledger_sign_check;
ALTER TABLE commission_ledger ADD CONSTRAINT commission_ledger_sign_check CHECK (
  (kind IN ('payment', 'chargeback_won') AND gross_cents >= 0 AND commission_cents >= 0 AND coach_cents >= 0)
  OR (kind NOT IN ('payment', 'chargeback_won') AND gross_cents <= 0 AND commission_cents <= 0 AND coach_cents <= 0)
);

-- A student who accepted a new coach while still having an old one: the old
-- link is only ended when the new coach's payment really arrives.
ALTER TABLE coach_clients ADD COLUMN replaces_link_id UUID REFERENCES coach_clients(id) ON DELETE SET NULL;

-- Subscriptions the payment company has not yet confirmed as stopped. Kept
-- until the cancel works; retried on the owner's "Pay coaches now" and on the
-- student's next visit to their subscriptions.
CREATE TABLE pending_cancels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_subscription_id TEXT NOT NULL UNIQUE,
  subscription_id UUID REFERENCES student_subscriptions(id) ON DELETE SET NULL,
  reason TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Automatic refunds for payments that cannot be used (the coaching link could
-- not go live, or it was a duplicate). One row per payment; stays 'pending'
-- (and is shown to the owner) until the payment company confirms the refund.
CREATE TABLE pending_refunds (
  provider_payment_id TEXT PRIMARY KEY,
  coach_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount_cents INTEGER,
  currency TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
