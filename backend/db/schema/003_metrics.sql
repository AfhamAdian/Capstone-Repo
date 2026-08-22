-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
-- Split from apps/api/src/database/schema.sql - see db/README.md.
-- Depends on: 002_projects.sql (project, projectsnapshot)

CREATE TABLE public.codeownershipconcentration (
  id integer NOT NULL DEFAULT nextval('codeownershipconcentration_id_seq'::regclass),
  snapshot_id integer NOT NULL,
  path text NOT NULL,
  top_contributor_percent numeric,
  is_flagged boolean,
  CONSTRAINT codeownershipconcentration_pkey PRIMARY KEY (id),
  CONSTRAINT codeownershipconcentration_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.projectsnapshot(id)
);

CREATE TABLE public.codequalitymetrics (
  id integer NOT NULL DEFAULT nextval('codequalitymetrics_id_seq'::regclass),
  snapshot_id integer NOT NULL UNIQUE,
  technical_debt_ratio numeric,
  technical_debt_minutes numeric,
  maintainability_rating numeric,
  code_smells integer,
  duplicated_lines_density numeric,
  bugs integer,
  reliability_rating numeric,
  vulnerabilities integer,
  security_rating numeric,
  critical_vulnerabilities integer,
  high_vulnerabilities integer,
  coverage numeric,
  lines_of_code integer,
  quality_gate_status character varying,
  new_bugs integer,
  new_vulnerabilities integer,
  new_code_smells integer,
  new_coverage numeric,
  new_duplicated_lines_density numeric,
  new_technical_debt numeric,
  CONSTRAINT codequalitymetrics_pkey PRIMARY KEY (id),
  CONSTRAINT codequalitymetrics_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.projectsnapshot(id)
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

CREATE TABLE public.projectmanagementmetrics (
  id integer NOT NULL DEFAULT nextval('projectmanagementmetrics_id_seq'::regclass),
  snapshot_id integer NOT NULL UNIQUE,
  sprint_completion_rate numeric,
  issue_cycle_time_avg_days numeric,
  throughput_per_week integer,
  carryover_rate numeric,
  scope_creep_rate numeric,
  blocked_items_count integer,
  blocked_items_avg_age_days numeric,
  overdue_items_count integer,
  lead_time_avg_days numeric,
  lead_time_median_days numeric,
  lead_time_p95_days numeric,
  lead_time_variance numeric,
  spillover_ratio numeric,
  consecutive_spillover_count integer,
  carryover_avg_age_days numeric,
  blocked_ticket_percent numeric,
  avg_blocked_duration_days numeric,
  max_blocked_duration_days numeric,
  blocked_reentry_count integer,
  mid_sprint_additions integer,
  scope_churn_ratio numeric,
  priority_change_count integer,
  in_progress_avg_age_days numeric,
  stale_ticket_ratio numeric,
  state_movement_count integer,
  health_score numeric,
  CONSTRAINT projectmanagementmetrics_pkey PRIMARY KEY (id),
  CONSTRAINT projectmanagementmetrics_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.projectsnapshot(id)
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
