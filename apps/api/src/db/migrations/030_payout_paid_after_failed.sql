-- A payout the owner marked "not sent" that the payment company later turns out
-- to have sent. Cut only flags it for the owner (no money changes). Loosens the
-- allowed `attention` codes by one; nothing is dropped, rewritten or tightened.
ALTER TABLE payouts DROP CONSTRAINT payouts_attention_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_attention_check
  CHECK (attention IS NULL OR attention IN ('unconfirmed_reply', 'lookup_failed', 'paid_after_marked_failed'));
