-- 017: server-side session revocation (log-out actually logs you out)
--
-- Login tokens live for 7 days. Until now, logging out only cleared the cookie
-- in the browser — a token that had already been copied stayed valid for the
-- rest of those 7 days. This column is the account's "token version": every
-- login token is stamped with the value it had when the token was signed, and
-- the server re-checks it on every request. Logging out (or deleting the
-- account) bumps this number, which instantly invalidates every outstanding
-- token for that account.
ALTER TABLE users
  ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
