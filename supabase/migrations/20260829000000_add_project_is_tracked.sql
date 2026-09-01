-- Whether a project is actively tracked in the portfolio (the All/Tracked filter + bookmark toggle).
-- Defaults to true so every existing and new project starts tracked, matching the prior client-only behavior.
alter table public.project
  add column if not exists is_tracked boolean not null default true;
