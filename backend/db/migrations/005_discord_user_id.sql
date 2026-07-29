-- Survey feature migration 005.
-- Adds a Discord identity column so the notification layer can DM developers
-- individually (alongside Slack DM + email) instead of only broadcasting to a
-- channel. Discord's Bot API has no email-based user lookup (unlike Slack's
-- users.lookupByEmail), so this column must be populated out of band (e.g. an
-- admin field, or a bot command that captures it) - there is no automatic
-- email -> Discord ID resolution possible.
-- Apply the same way as 002-004 (manual SQL editor / psql), then keep
-- db/schema/001_users_and_companies.sql and db/migration.sql in sync.

ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS discord_user_id character varying;
