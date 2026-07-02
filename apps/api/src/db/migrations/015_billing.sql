-- Remember each user's Stripe customer id so a cancelled subscription
-- (which only carries the customer id) can be matched back to the account.
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
