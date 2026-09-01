-- Paddle replaces Stripe as the payment provider. Nobody has paid yet — the
-- Stripe column was always empty — so the old column is simply dropped rather
-- than copied across, which keeps the table clean.
ALTER TABLE users DROP COLUMN IF EXISTS stripe_customer_id;

-- Remember each member's Paddle customer reference so a cancelled subscription
-- (which only names the customer) can be matched back to the right account.
ALTER TABLE users ADD COLUMN paddle_customer_id TEXT;
