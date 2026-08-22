-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
-- Split from apps/api/src/database/schema.sql - see db/README.md.
-- Depends on: 001_users_and_companies.sql (company, User)

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
  CONSTRAINT project_pkey PRIMARY KEY (id),
  CONSTRAINT project_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id)
);

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

CREATE TABLE public.projecttoolintegration (
  id integer NOT NULL DEFAULT nextval('projecttoolintegration_id_seq'::regclass),
  project_id integer NOT NULL,
  tool_category character varying NOT NULL,
  tool_name character varying NOT NULL,
  external_project_id character varying NOT NULL,
  last_synced_at timestamp without time zone,
  is_active boolean,
  CONSTRAINT projecttoolintegration_pkey PRIMARY KEY (id),
  CONSTRAINT projecttoolintegration_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id)
);

CREATE TABLE public.projectsnapshot (
  id integer NOT NULL DEFAULT nextval('projectsnapshot_id_seq'::regclass),
  project_id integer NOT NULL,
  snapshot_time timestamp without time zone NOT NULL,
  created_at timestamp without time zone,
  CONSTRAINT projectsnapshot_pkey PRIMARY KEY (id),
  CONSTRAINT projectsnapshot_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id)
);
