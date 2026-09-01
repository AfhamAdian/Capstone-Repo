-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.projectmanagementmetrics (
  id integer NOT NULL DEFAULT nextval('projectmanagementmetrics_id_seq'::regclass),
  snapshot_id integer NOT NULL UNIQUE,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT projectmanagementmetrics_pkey PRIMARY KEY (id),
  CONSTRAINT projectmanagementmetrics_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.projectsnapshot(id)
);
