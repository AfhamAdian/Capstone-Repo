-- Link projects to their workspace. Nullable so pre-workspace projects keep working;
-- only repos imported through the workspace wizard get a workspace_id.
alter table public.project
  add column if not exists workspace_id integer references public.workspace(id);

create index if not exists project_workspace_id_idx on public.project (workspace_id);
