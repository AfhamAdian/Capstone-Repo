-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.company (
  id integer NOT NULL DEFAULT nextval('company_id_seq'::regclass),
  name character varying NOT NULL,
  created_at timestamp without time zone,
  CONSTRAINT company_pkey PRIMARY KEY (id)
);
