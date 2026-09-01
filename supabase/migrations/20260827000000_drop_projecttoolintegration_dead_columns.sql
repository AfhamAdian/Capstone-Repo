-- config remains the single source of truth for per-tool credentials/settings.
alter table public.projecttoolintegration
  drop column if exists external_project_id,
  drop column if exists is_active;
