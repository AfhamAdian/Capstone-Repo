-- Drop the legacy owner/repo columns from project. Credentials/identity now live in
-- projecttoolintegration.config (github {owner, repo, token});
alter table public.project
  drop column if exists owner,
  drop column if exists repo;
