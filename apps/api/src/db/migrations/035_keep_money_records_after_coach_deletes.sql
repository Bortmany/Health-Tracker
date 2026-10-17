-- When a coach deletes their account, their payout and commission records are
-- kept for accounting but detached from the deleted person (coach_id becomes
-- empty). Before this, those two links blocked the deletion with an error.
-- Account deletion itself refuses while money is still owed or a payout is
-- in progress (routes/account.js), so only settled history is ever detached.
ALTER TABLE payouts ALTER COLUMN coach_id DROP NOT NULL;
ALTER TABLE payouts DROP CONSTRAINT payouts_coach_id_fkey;
ALTER TABLE payouts ADD CONSTRAINT payouts_coach_id_fkey
  FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE commission_ledger ALTER COLUMN coach_id DROP NOT NULL;
ALTER TABLE commission_ledger DROP CONSTRAINT commission_ledger_coach_id_fkey;
ALTER TABLE commission_ledger ADD CONSTRAINT commission_ledger_coach_id_fkey
  FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE SET NULL;
