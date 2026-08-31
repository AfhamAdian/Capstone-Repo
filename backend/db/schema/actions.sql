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
  company_id integer,
  logged_by_user_id integer,
  next_review_at timestamp with time zone,
  effectiveness_rated_by_user_id integer,
  effectiveness_rated_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT actions_pkey PRIMARY KEY (id),
  CONSTRAINT actions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id),
  CONSTRAINT actions_logged_by_user_id_fkey FOREIGN KEY (logged_by_user_id) REFERENCES public."User"(id),
  CONSTRAINT actions_effectiveness_rated_by_user_id_fkey FOREIGN KEY (effectiveness_rated_by_user_id) REFERENCES public."User"(id)
);
