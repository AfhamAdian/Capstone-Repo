-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.survey_recipient (
  id integer NOT NULL,
  survey_id integer NOT NULL,
  project_id integer NOT NULL,
  user_id integer NOT NULL,
  email character varying NOT NULL,
  status character varying NOT NULL DEFAULT 'sent'::character varying CHECK (status::text = ANY (ARRAY['sent'::character varying, 'skipped'::character varying, 'failed'::character varying]::text[])),
  skip_reason character varying,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT survey_recipient_pkey PRIMARY KEY (id),
  CONSTRAINT survey_recipient_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id),
  CONSTRAINT survey_recipient_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id),
  CONSTRAINT survey_recipient_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."User"(id)
);
