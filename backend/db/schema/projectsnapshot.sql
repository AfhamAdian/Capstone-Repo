-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.projectsnapshot (
  id integer NOT NULL DEFAULT nextval('projectsnapshot_id_seq'::regclass),
  project_id integer NOT NULL,
  snapshot_time timestamp without time zone NOT NULL,
  created_at timestamp without time zone,
  CONSTRAINT projectsnapshot_pkey PRIMARY KEY (id),
  CONSTRAINT projectsnapshot_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id)
);
