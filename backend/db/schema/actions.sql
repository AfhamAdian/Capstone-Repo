-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.actions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_ids ARRAY NOT NULL,
  problem text NOT NULL,
  reason text NOT NULL,
  action_taken text NOT NULL,
  action_date date NOT NULL DEFAULT CURRENT_DATE,
  effectiveness integer CHECK (effectiveness >= 1 AND effectiveness <= 5),
  logged_by text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT actions_pkey PRIMARY KEY (id)
);
