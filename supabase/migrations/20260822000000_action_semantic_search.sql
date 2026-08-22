-- Semantic management-action search using Supabase Postgres + pgvector.
-- The vector column is intentionally dimension-agnostic so the migration can be
-- applied before locking the SiliconFlow model. Exact search is appropriate for
-- the current small corpus. Add a dimensioned HNSW index in a later migration
-- after the model dimension is fixed and measured data volume warrants it.

create extension if not exists vector with schema extensions;

create table if not exists public.action_embeddings (
  action_id uuid not null references public.actions(id) on delete cascade,
  embedding_version text not null,
  provider text not null check (provider = 'siliconflow'),
  model text not null,
  dimensions integer not null check (dimensions > 0),
  content_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'failed')),
  embedding extensions.vector,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  embedded_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint action_embeddings_pkey primary key (action_id, embedding_version),
  constraint action_embeddings_ready_has_vector check (
    status <> 'ready' or embedding is not null
  )
);

create index if not exists idx_action_embeddings_pending
  on public.action_embeddings (status, updated_at)
  where status in ('pending', 'failed');

create or replace function public.claim_action_embedding(
  p_action_id uuid,
  p_embedding_version text
)
returns boolean
language plpgsql
as $$
declare
  claimed boolean;
begin
  update public.action_embeddings
  set status = 'processing',
      attempt_count = attempt_count + 1,
      last_error = null,
      updated_at = now()
  where action_id = p_action_id
    and embedding_version = p_embedding_version
    and status in ('pending', 'failed')
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function public.match_actions(
  query_embedding extensions.vector,
  target_embedding_version text,
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
      and (filter_project_id is null or a.project_ids @> array[filter_project_id])
  )
  select
    scored.id,
    scored.project_ids,
    scored.problem,
    scored.reason,
    scored.action_taken,
    scored.action_date,
    scored.effectiveness,
    scored.logged_by,
    scored.created_at,
    scored.similarity
  from scored
  where scored.similarity >= match_threshold
  order by scored.similarity desc, scored.action_date desc
  limit least(greatest(match_count, 1), 100);
$$;

comment on table public.action_embeddings is
  'Versioned SiliconFlow embeddings for management-action semantic search.';
comment on function public.match_actions is
  'Exact cosine-similarity search over ready management-action embeddings.';
