-- Deletes the old food and calorie-eaten tables; food tracking was removed from
-- the app in the October 2026 round. Cannot be undone by a code rollback —
-- restoring needs a database backup.
-- (daily_logs.calories is kept: it is calories BURNED, filled by the health sync.)
-- Meals first, because they point at the daily food logs.
DROP TABLE IF EXISTS nutrition_log_meals;
DROP TABLE IF EXISTS nutrition_logs;
