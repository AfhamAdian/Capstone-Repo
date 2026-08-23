-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.User (
  id integer NOT NULL DEFAULT nextval('"User_id_seq"'::regclass),
  company_id integer NOT NULL,
  name character varying NOT NULL,
  email character varying NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamp without time zone,
  discord_user_id character varying,
  role character varying NOT NULL DEFAULT 'member'::character varying CHECK (role::text = ANY (ARRAY['admin'::character varying, 'member'::character varying]::text[])),
  CONSTRAINT User_pkey PRIMARY KEY (id),
  CONSTRAINT User_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id)
);
