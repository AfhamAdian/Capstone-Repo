-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.projectmember (
  id integer NOT NULL DEFAULT nextval('projectmember_id_seq'::regclass),
  project_id integer NOT NULL,
  user_id integer NOT NULL,
  role character varying NOT NULL,
  joined_at timestamp without time zone,
  CONSTRAINT projectmember_pkey PRIMARY KEY (id),
  CONSTRAINT projectmember_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id),
  CONSTRAINT projectmember_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.User(id)
);
