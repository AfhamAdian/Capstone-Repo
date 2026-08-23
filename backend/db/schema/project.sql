-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.project (
  id integer NOT NULL DEFAULT nextval('project_id_seq'::regclass),
  company_id integer NOT NULL,
  name character varying NOT NULL,
  description text,
  created_at timestamp without time zone,
  owner character varying,
  repo character varying,
  JIRA_TOKEN text,
  JIRA_EMAIL text,
  JIRA_BASE_URL text,
  JIRA_PROJECT_KEY text,
  JIRA_BOARD_ID text,
  GITHUB_TOKEN text,
  sonar_token text,
  sonar_organization text,
  sonar_project_key text,
  sonar_base_url text,
  pending_survey boolean NOT NULL DEFAULT false,
  pending_survey_trigger character varying,
  CONSTRAINT project_pkey PRIMARY KEY (id),
  CONSTRAINT project_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id)
);
