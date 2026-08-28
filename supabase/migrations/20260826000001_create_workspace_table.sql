-- Workspace = a named group of projects backed by one VCS connection (provider + org + PAT).
-- A company can have many workspaces. RLS is enabled (deny-all): only the service_role
-- backend touches this table, and the anon/authenticated keys must never read the PAT.
-- NOTE: project.workspace_id is added in a later migration (projects link to a workspace then).

create table if not exists public.workspace (
  id            integer      generated always as identity primary key,
  company_id    integer      not null references public.company(id),
  name          varchar(255) not null,
  vcs_provider  varchar(50)  not null,   -- github | gitlab | bitbucket
  organization  varchar(255) not null,   -- org / owner the PAT is scoped to
  access_token  text         not null,   -- PAT, plaintext for now
  created_at    timestamp    default now()
);

create index if not exists workspace_company_id_idx on public.workspace (company_id);

alter table public.workspace enable row level security;
