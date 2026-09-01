-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.riskscore (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  project_snapshot_id integer NOT NULL UNIQUE,
  security_score double precision,
  reliability_score double precision,
  maintainability_score double precision,
  cicd_deployment_health_score double precision,
  team_health_score double precision,
  engineering_process_score double precision,
  planning_execution_score double precision,
  overall_score double precision,
  CONSTRAINT riskscore_pkey PRIMARY KEY (id),
  CONSTRAINT riskscore_project_snapshot_id_fkey FOREIGN KEY (project_snapshot_id) REFERENCES public.projectsnapshot(id)
);
