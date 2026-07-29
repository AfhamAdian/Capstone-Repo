-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
-- Split from apps/api/src/database/schema.sql - see db/README.md.

CREATE TABLE public.company (
  id integer NOT NULL DEFAULT nextval('company_id_seq'::regclass),
  name character varying NOT NULL,
  created_at timestamp without time zone,
  CONSTRAINT company_pkey PRIMARY KEY (id)
);

CREATE TABLE public.User (
  id integer NOT NULL DEFAULT nextval('"User_id_seq"'::regclass),
  company_id integer NOT NULL,
  name character varying NOT NULL,
  email character varying NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamp without time zone,
  discord_user_id character varying,  -- added by db/migrations/005_discord_user_id.sql (survey feature: bot DM delivery)
  CONSTRAINT User_pkey PRIMARY KEY (id),
  CONSTRAINT User_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id)
);
