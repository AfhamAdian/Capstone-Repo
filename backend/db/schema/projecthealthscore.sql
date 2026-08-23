-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.projecthealthscore (
  id integer NOT NULL DEFAULT nextval('projecthealthscore_id_seq'::regclass),
  project_id integer NOT NULL,
  project_snapshot_id integer,
  survey_id integer,
  delivery_score numeric,
  code_quality_score numeric,
  cicd_score numeric,
  team_health_score numeric,
  overall_score numeric,
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT projecthealthscore_pkey PRIMARY KEY (id),
  CONSTRAINT projecthealthscore_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id),
  CONSTRAINT projecthealthscore_snapshot_id_fkey FOREIGN KEY (project_snapshot_id) REFERENCES public.projectsnapshot(id),
  CONSTRAINT projecthealthscore_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id)
);
