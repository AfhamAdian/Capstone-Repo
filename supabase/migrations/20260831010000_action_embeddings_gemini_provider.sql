-- Switch new management-action embeddings to Gemini while preserving truthful
-- provider metadata on historical SiliconFlow rows. The vector column is
-- dimension-agnostic, so Gemini's 768-dimensional vectors need no column rewrite.

alter table public.action_embeddings
  drop constraint if exists action_embeddings_provider_check;

alter table public.action_embeddings
  add constraint action_embeddings_provider_check
  check (provider in ('gemini', 'siliconflow'));

comment on table public.action_embeddings is
  'Versioned Gemini embeddings for management-action semantic search; historical provider rows are retained.';
