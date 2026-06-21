-- The CHECK constraint requiring activity_id or name broke on cascading
-- deletes (ON DELETE SET NULL fires at the engine level, bypassing the
-- app-level name backfill). Relax it: the API still backfills name on
-- delete for the common path, but a deleted activity with no name
-- recorded is acceptable rather than a hard failure.
ALTER TABLE daily_log_activities DROP CONSTRAINT daily_log_activities_check;
