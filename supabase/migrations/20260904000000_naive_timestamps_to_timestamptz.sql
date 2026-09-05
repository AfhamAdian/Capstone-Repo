-- Convert the remaining `timestamp without time zone` columns to `timestamptz`.
--
-- WHY
-- These columns are all written by application code with `Date.toISOString()`, i.e. UTC.
-- Postgres discards the trailing `Z` when storing into a naive column, and PostgREST then
-- returns the value with no offset at all ("2026-09-04T15:35:09.668"). JavaScript parses an
-- offset-less date-TIME string as LOCAL time, so every consumer silently shifted the instant
-- by its own UTC offset. `projectsnapshot.snapshot_time` was the live case: it drives the
-- dashboard's chart labels and the "last synced" text.
--
-- SAFETY
-- None of these columns has a DEFAULT now() — every value was written by app code as UTC —
-- so reinterpreting the stored wall-clock as UTC is lossless and exact.
-- No application code range-filters these columns with a non-UTC input, and ordering is
-- unchanged because the conversion is monotonic.
--
-- NOTE
-- The application code already handles BOTH shapes (see apps/api/utils/db-timestamp.ts:
-- parseDbTimestamp only pins an offset when one is absent), so this migration can be applied
-- at any time, and the app stays correct before and after it.

BEGIN;

ALTER TABLE public.projectsnapshot
  ALTER COLUMN snapshot_time TYPE timestamptz USING snapshot_time AT TIME ZONE 'UTC',
  ALTER COLUMN created_at    TYPE timestamptz USING created_at    AT TIME ZONE 'UTC';

ALTER TABLE public.project
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

ALTER TABLE public.company
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

ALTER TABLE public."user"
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';

ALTER TABLE public.projectmember
  ALTER COLUMN joined_at TYPE timestamptz USING joined_at AT TIME ZONE 'UTC';

ALTER TABLE public.projecttoolintegration
  ALTER COLUMN last_synced_at TYPE timestamptz USING last_synced_at AT TIME ZONE 'UTC';

ALTER TABLE public.metricweight
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';

COMMIT;
