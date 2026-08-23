-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

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
