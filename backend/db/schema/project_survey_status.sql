-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.project_survey_status (
  project_id integer NOT NULL,
  pending_survey boolean NOT NULL DEFAULT false,
  pending_survey_trigger character varying,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT project_survey_status_pkey PRIMARY KEY (project_id),
  CONSTRAINT project_survey_status_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id)
);
