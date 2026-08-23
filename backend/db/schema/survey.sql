-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.survey (
  id integer NOT NULL DEFAULT nextval('survey_id_seq'::regclass),
  project_id integer NOT NULL,
  status character varying NOT NULL DEFAULT 'draft'::character varying CHECK (status::text = ANY (ARRAY['draft'::character varying, 'active'::character varying, 'paused'::character varying, 'closed'::character varying, 'completed'::character varying, 'cancelled'::character varying, 'failed'::character varying]::text[])),
  source character varying NOT NULL CHECK (source::text = ANY (ARRAY['manual'::character varying, 'auto_pulse'::character varying]::text[])),
  trigger character varying NOT NULL,
  custom_guidance text,
  target_count integer NOT NULL DEFAULT 0,
  sent_at timestamp with time zone,
  completed_at timestamp with time zone,
  period_month date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  scheduled_send_at timestamp with time zone,
  closed_at timestamp with time zone,
  close_reason character varying,
  analysis_error text,
  health_context jsonb,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array'::text),
  cycle_id character varying,
  expires_at timestamp with time zone,
  notified_at timestamp with time zone,
  delivery jsonb NOT NULL DEFAULT '{}'::jsonb,
  insight jsonb,
  CONSTRAINT survey_pkey PRIMARY KEY (id),
  CONSTRAINT survey_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id)
);
