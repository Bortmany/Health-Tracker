-- The owner's short note when they settle a payout stuck in manual review
-- (marked sent or marked failed after checking with the payment company).
-- Additive only: one new nullable column.
ALTER TABLE payouts ADD COLUMN resolution_note TEXT
  CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 300);
