-- When Cut last re-checked a payout marked "not sent" with the payment company,
-- so each press of the button looks at the least-recently-checked ones first
-- instead of the same few every time. Additive only: one new nullable column.
ALTER TABLE payouts ADD COLUMN recheck_at TIMESTAMPTZ;
