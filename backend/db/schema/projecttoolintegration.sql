-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.projecttoolintegration (
  id integer NOT NULL DEFAULT nextval('projecttoolintegration_id_seq'::regclass),
  project_id integer NOT NULL,
  tool_category character varying NOT NULL,
  tool_name character varying NOT NULL,
  external_project_id character varying NOT NULL,
  last_synced_at timestamp without time zone,
  is_active boolean,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT projecttoolintegration_pkey PRIMARY KEY (id),
  CONSTRAINT projecttoolintegration_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id)
);
