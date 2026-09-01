-- Drop the unused User.discord_user_id column. No backend code references it.
alter table public."User" drop column if exists discord_user_id;
