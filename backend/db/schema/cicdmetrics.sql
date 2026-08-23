-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.cicdmetrics (
  id integer NOT NULL DEFAULT nextval('cicdmetrics_id_seq'::regclass),
  snapshot_id integer NOT NULL UNIQUE,
  pipeline_success_rate_percent numeric,
  avg_pipeline_duration_minutes numeric,
  flaky_test_count integer,
  test_coverage_percent numeric,
  test_failure_rate_percent numeric,
  avg_pipeline_runs_per_pr numeric,
  deployments_per_week numeric,
  deployment_failure_rate_percent numeric,
  mttr_hours numeric,
  time_to_prod_hours numeric,
  CONSTRAINT cicdmetrics_pkey PRIMARY KEY (id),
  CONSTRAINT cicdmetrics_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.projectsnapshot(id)
);
