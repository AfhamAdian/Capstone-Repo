-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.metricweight (
  id integer NOT NULL DEFAULT nextval('metricweight_id_seq'::regclass),
  project_id integer NOT NULL,
  metric_name character varying NOT NULL,
  weight numeric NOT NULL,
  updated_at timestamp without time zone,
  CONSTRAINT metricweight_pkey PRIMARY KEY (id),
  CONSTRAINT metricweight_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id)
);
