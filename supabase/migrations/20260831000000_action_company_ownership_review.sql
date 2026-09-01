-- Company-scoped management actions with authenticated ownership and deferred
-- effectiveness review. Existing rows are backfilled only when their company
-- and owner can be identified unambiguously; unresolved legacy rows stay hidden
-- from the scoped API rather than being assigned to the wrong person.

alter table public.actions
  add column if not exists company_id integer references public.company(id),
  add column if not exists logged_by_user_id integer references public."User"(id),
  add column if not exists next_review_at timestamp with time zone,
  add column if not exists effectiveness_rated_by_user_id integer references public."User"(id),
  add column if not exists effectiveness_rated_at timestamp with time zone,
  add column if not exists updated_at timestamp with time zone not null default now();

-- Resolve legacy action companies through numeric project ids, project-name
-- slugs, or the repository name stored in the VCS integration config. Only use
-- a match when every match points to one company.
with candidate_companies as (
  select
    a.id as action_id,
    min(p.company_id) as company_id,
    count(distinct p.company_id) as company_count
  from public.actions a
  join public.project p on (
    p.id::text = any(a.project_ids)
    or trim(both '-' from regexp_replace(lower(p.name), '[^a-z0-9]+', '-', 'g')) = any(a.project_ids)
    or exists (
      select 1
      from public.projecttoolintegration pti
      where pti.project_id = p.id
        and pti.tool_category = 'vcs'
        and lower(coalesce(pti.config->>'repo', '')) = any(a.project_ids)
    )
  )
  where a.company_id is null
  group by a.id
)
update public.actions a
set company_id = c.company_id,
    updated_at = now()
from candidate_companies c
where a.id = c.action_id
  and c.company_count = 1;

-- Resolve a legacy owner only when one user in the resolved company matches the
-- stored display name or email.
with candidate_users as (
  select
    a.id as action_id,
    min(u.id) as user_id,
    count(distinct u.id) as user_count
  from public.actions a
  join public."User" u
    on u.company_id = a.company_id
   and lower(a.logged_by) in (lower(u.email), lower(u.name))
  where a.logged_by_user_id is null
  group by a.id
)
update public.actions a
set logged_by_user_id = c.user_id,
    updated_at = now()
from candidate_users c
where a.id = c.action_id
  and c.user_count = 1;

update public.actions
set next_review_at = action_date::timestamp with time zone + interval '7 days'
where effectiveness is null
  and next_review_at is null;

create index if not exists idx_actions_company_date
  on public.actions (company_id, action_date desc);

create index if not exists idx_actions_owner_date
  on public.actions (logged_by_user_id, action_date desc);

create index if not exists idx_actions_owner_pending_review
  on public.actions (logged_by_user_id, next_review_at)
  where effectiveness is null;

-- Tenant-aware semantic search. Members pass their user id; admins pass null to
-- search every action in their company. The older match_actions RPC remains for
-- compatibility with already-running workers, but the API no longer calls it.
create or replace function public.match_company_actions(
  query_embedding extensions.vector,
  target_embedding_version text,
  filter_company_id integer,
  filter_logged_by_user_id integer default null,
  match_threshold double precision default 0.70,
  match_count integer default 5,
  filter_project_id text default null
)
returns table (
  id uuid,
  project_ids text[],
  problem text,
  reason text,
  action_taken text,
  action_date date,
  effectiveness integer,
  logged_by text,
  created_at timestamp with time zone,
  company_id integer,
  logged_by_user_id integer,
  next_review_at timestamp with time zone,
  effectiveness_rated_by_user_id integer,
  effectiveness_rated_at timestamp with time zone,
  updated_at timestamp with time zone,
  similarity double precision
)
language sql
stable
as $$
  with scored as materialized (
    select
      a.id,
      a.project_ids,
      a.problem,
      a.reason,
      a.action_taken,
      a.action_date,
      a.effectiveness,
      a.logged_by,
      a.created_at,
      a.company_id,
      a.logged_by_user_id,
      a.next_review_at,
      a.effectiveness_rated_by_user_id,
      a.effectiveness_rated_at,
      a.updated_at,
      case
        when ae.dimensions = extensions.vector_dims(query_embedding)
          then 1 - (ae.embedding <=> query_embedding)
        else null
      end as similarity
    from public.action_embeddings ae
    join public.actions a on a.id = ae.action_id
    where ae.status = 'ready'
      and ae.embedding_version = target_embedding_version
      and ae.embedding is not null
      and a.company_id = filter_company_id
      and (filter_logged_by_user_id is null or a.logged_by_user_id = filter_logged_by_user_id)
      and (filter_project_id is null or a.project_ids @> array[filter_project_id])
  )
  select *
  from scored
  where scored.similarity >= match_threshold
  order by scored.similarity desc, scored.action_date desc
  limit least(greatest(match_count, 1), 100);
$$;

comment on function public.match_company_actions is
  'Company- and optional owner-scoped cosine search over ready action embeddings.';

-- Search is exposed only through the authenticated API, whose service-role
-- client derives these filters from the server-side session.
revoke all on function public.match_company_actions(
  extensions.vector, text, integer, integer, double precision, integer, text
) from public, anon, authenticated;
grant execute on function public.match_company_actions(
  extensions.vector, text, integer, integer, double precision, integer, text
) to service_role;

-- This application uses its own server-side sessions rather than Supabase Auth.
-- Keep the underlying action ledger and the legacy unscoped search RPC behind
-- the service-role API so browser clients cannot bypass role checks.
revoke all privileges on table public.actions, public.action_embeddings from anon, authenticated;
revoke all on function public.match_actions(
  extensions.vector, text, double precision, integer, text
) from public, anon, authenticated;
grant execute on function public.match_actions(
  extensions.vector, text, double precision, integer, text
) to service_role;
