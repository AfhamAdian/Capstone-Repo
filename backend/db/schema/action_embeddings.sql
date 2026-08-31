-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.action_embeddings (
  action_id uuid NOT NULL,
  embedding_version text NOT NULL,
  provider text NOT NULL CHECK (provider = ANY (ARRAY['gemini'::text, 'siliconflow'::text])),
  model text NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions > 0),
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready'::text, 'failed'::text])),
  embedding USER-DEFINED,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  embedded_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT action_embeddings_pkey PRIMARY KEY (action_id, embedding_version),
  CONSTRAINT action_embeddings_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.actions(id)
);
