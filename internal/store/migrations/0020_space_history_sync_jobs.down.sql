-- Migration 0020 down: drop space_history_sync_jobs
DROP INDEX IF EXISTS idx_sync_jobs_recent;
DROP TABLE IF EXISTS space_history_sync_jobs;
