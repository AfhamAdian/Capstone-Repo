-- Drop the per-member role column from projectmember.
alter table public.projectmember
  drop column if exists role;
