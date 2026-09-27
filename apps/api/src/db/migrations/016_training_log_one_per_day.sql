-- One training session per user per day.
--
-- Without this, tapping "Save" twice (or two devices saving the same session at
-- once) could store two copies of the session. This matches how daily_logs and
-- nutrition_logs already work, and lets the save use ON CONFLICT to update the
-- existing session instead of inserting a duplicate.
--
-- If any accidental duplicates already exist, keep the most recently created row
-- for each user/day and remove the older copies before adding the constraint.
DELETE FROM training_logs t
USING training_logs newer
WHERE t.user_id = newer.user_id
  AND t.date = newer.date
  AND t.created_at < newer.created_at;

ALTER TABLE training_logs
  ADD CONSTRAINT training_logs_user_id_date_key UNIQUE (user_id, date);
