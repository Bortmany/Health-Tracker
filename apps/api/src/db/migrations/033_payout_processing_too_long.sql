-- A payout whose transfer the payment company keeps calling "processing" for
-- days is parked for the owner with its own reason. Loosens the allowed
-- `attention` codes by one; nothing is dropped, rewritten or tightened.
ALTER TABLE payouts DROP CONSTRAINT payouts_attention_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_attention_check
  CHECK (attention IS NULL OR attention IN ('unconfirmed_reply', 'lookup_failed', 'paid_after_marked_failed', 'keyless_transfer_nearby', 'processing_too_long'));
