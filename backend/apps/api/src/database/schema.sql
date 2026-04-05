-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.User (
  id integer NOT NULL DEFAULT nextval('"User_id_seq"'::regclass),
  company_id integer NOT NULL,
  name character varying NOT NULL,
  email character varying NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamp without time zone,
  CONSTRAINT User_pkey PRIMARY KEY (id),
  CONSTRAINT User_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id)
);
CREATE TABLE public.codeownershipconcentration (
  id integer NOT NULL DEFAULT nextval('codeownershipconcentration_id_seq'::regclass),
  snapshot_id integer NOT NULL,
  path text NOT NULL,
  top_contributor_percent numeric,
  is_flagged boolean,
  CONSTRAINT codeownershipconcentration_pkey PRIMARY KEY (id),
  CONSTRAINT codeownershipconcentration_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.projectsnapshot(id)
);
CREATE TABLE public.company (
  id integer NOT NULL DEFAULT nextval('company_id_seq'::regclass),
  name character varying NOT NULL,
  created_at timestamp without time zone,
  CONSTRAINT company_pkey PRIMARY KEY (id)
);
CREATE TABLE public.leadtimetrend (
  id integer NOT NULL DEFAULT nextval('leadtimetrend_id_seq'::regclass),
  snapshot_id integer NOT NULL,
  sprint_name character varying,
  avg_lead_time_days numeric,
  CONSTRAINT leadtimetrend_pkey PRIMARY KEY (id),
  CONSTRAINT leadtimetrend_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.projectsnapshot(id)
);
CREATE TABLE public.metricweight (
  id integer NOT NULL DEFAULT nextval('metricweight_id_seq'::regclass),
  project_id integer NOT NULL,
  metric_name character varying NOT NULL,
  weight numeric NOT NULL,
  updated_at timestamp without time zone,
  CONSTRAINT metricweight_pkey PRIMARY KEY (id),
  CONSTRAINT metricweight_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id)
);
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
  CONSTRAINT project_pkey PRIMARY KEY (id),
  CONSTRAINT project_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id)
);
CREATE TABLE public.projectmanagementmetrics (
  id integer NOT NULL DEFAULT nextval('projectmanagementmetrics_id_seq'::regclass),
  snapshot_id integer NOT NULL UNIQUE,
  sprint_completion_rate numeric,
  issue_cycle_time_avg_days numeric,
  throughput_per_week integer,
  carryover_rate numeric,
  scope_creep_rate numeric,
  estimation_accuracy numeric,
  blocked_items_count integer,
  blocked_items_avg_age_days numeric,
  overdue_items_count integer,
  lead_time_avg_days numeric,
  lead_time_median_days numeric,
  lead_time_p95_days numeric,
  lead_time_variance numeric,
  spillover_ratio numeric,
  story_point_spillover numeric,
  consecutive_spillover_count integer,
  carryover_avg_age_days numeric,
  blocked_ticket_percent numeric,
  avg_blocked_duration_days numeric,
  max_blocked_duration_days numeric,
  blocked_reentry_count integer,
  mid_sprint_additions integer,
  scope_churn_ratio numeric,
  priority_change_count integer,
  removed_scope_ratio numeric,
  in_progress_avg_age_days numeric,
  stale_ticket_ratio numeric,
  state_movement_count integer,
  health_score numeric,
  CONSTRAINT projectmanagementmetrics_pkey PRIMARY KEY (id),
  CONSTRAINT projectmanagementmetrics_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.projectsnapshot(id)
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
CREATE TABLE public.projectsnapshot (
  id integer NOT NULL DEFAULT nextval('projectsnapshot_id_seq'::regclass),
  project_id integer NOT NULL,
  snapshot_time timestamp without time zone NOT NULL,
  created_at timestamp without time zone,
  CONSTRAINT projectsnapshot_pkey PRIMARY KEY (id),
  CONSTRAINT projectsnapshot_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id)
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
CREATE TABLE public.versioncontrolmetrics (
  id integer NOT NULL DEFAULT nextval('versioncontrolmetrics_id_seq'::regclass),
  snapshot_id integer NOT NULL UNIQUE,
  issues_closed_per_week integer,
  issue_cycle_time_avg_days numeric,
  pr_review_coverage_percent numeric,
  review_per_pr_avg numeric,
  self_merged_pr_rate_percent numeric,
  time_to_first_review_avg_hours numeric,
  files_modified_gte_10_times integer,
  files_modified_by_gte_3_people integer,
  commit_with_issue_ref_percent numeric,
  commit_with_body_percent numeric,
  commit_following_convention_percent numeric,
  stale_pr_count integer,
  long_lived_branches_count integer,
  pr_revert_rate_percent numeric,
  bus_factor integer,
  active_contributions_per_week integer,
  review_network_density numeric,
  dependency_update_lag_avg_days numeric,
  health_score numeric,
  CONSTRAINT versioncontrolmetrics_pkey PRIMARY KEY (id),
  CONSTRAINT versioncontrolmetrics_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.projectsnapshot(id)
);