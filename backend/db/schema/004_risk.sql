-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
-- Split from apps/api/src/database/schema.sql - see db/README.md.
-- Depends on: 002_projects.sql (projectsnapshot)
-- Note: `blockers_score` is added by db/migrations/002_survey.sql, not here -
-- this file reflects the original pre-survey-feature shape.

CREATE TABLE public.riskscore (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  project_snapshot_id integer NOT NULL UNIQUE,
  cicd_reliability_score double precision,
  code_qaulity_score double precision,
  delivery_score double precision,
  engineering_process_score double precision,
  security_risk_score double precision,
  team_health_score double precision,
  CONSTRAINT riskscore_pkey PRIMARY KEY (id),
  CONSTRAINT riskscore_project_snapshot_id_fkey FOREIGN KEY (project_snapshot_id) REFERENCES public.projectsnapshot(id)
);
