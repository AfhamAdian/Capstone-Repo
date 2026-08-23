-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

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
