-- WARNING: This schema is for context only and is not meant to be run.
-- Current-state reference for the survey feature: the merged result of
-- db/migrations/002_survey.sql through 005_survey_shared_lifecycle.sql,
-- the same way schema.sql documents
-- "current shape" rather than history for the base tables. To actually apply
-- these changes to a live database, run db/migration.sql (or the individual
-- numbered files in db/migrations/), not this file.
-- Depends on: 002_projects.sql (project, projectmember), 004_risk.sql (riskscore)

CREATE TABLE public.survey (
  id integer NOT NULL DEFAULT nextval('survey_id_seq'::regclass),
  project_id integer NOT NULL,
  status character varying NOT NULL DEFAULT 'draft',
  source character varying NOT NULL,                 -- 'manual' | 'auto_pulse'
  trigger character varying NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  custom_guidance text,
  target_count integer NOT NULL DEFAULT 0,           -- expected audience size
  sent_at timestamp with time zone,
  completed_at timestamp with time zone,
  period_month date,
  review_deadline_at timestamp with time zone,
  scheduled_send_at timestamp with time zone,
  closed_at timestamp with time zone,
  close_reason character varying,
  health_context_snapshot jsonb,
  question_version integer NOT NULL DEFAULT 1,
  analysis_error text,
  CONSTRAINT survey_pkey PRIMARY KEY (id),
  CONSTRAINT survey_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id)
);

CREATE TABLE public.surveyquestion (
  id integer NOT NULL DEFAULT nextval('surveyquestion_id_seq'::regclass),
  survey_id integer NOT NULL,
  category character varying NOT NULL, -- key into surveycategory; built-ins: delivery|codeQuality|cicd|teamHealth|blockers
  question_text text NOT NULL,
  question_type character varying NOT NULL, -- 'text' | 'scale'
  order_index integer NOT NULL,
  CONSTRAINT surveyquestion_pkey PRIMARY KEY (id),
  CONSTRAINT surveyquestion_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id)
);

-- Data-driven survey categories (added in 003). Each maps to one of the five
-- canonical rubric buckets via rubric_category, so scoring/blending keeps
-- working for admin-created categories too. Built-ins are seeded and
-- is_builtin=true (cannot be deleted; rubric mapping cannot change).
CREATE TABLE public.surveycategory (
  id integer NOT NULL DEFAULT nextval('surveycategory_id_seq'::regclass),
  key character varying NOT NULL UNIQUE,
  label character varying NOT NULL,
  description text,
  rubric_category character varying NOT NULL, -- 'delivery' | 'codeQuality' | 'cicd' | 'teamHealth' | 'blockers'
  is_builtin boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT surveycategory_pkey PRIMARY KEY (id)
);

-- One anonymous shared link per survey distribution event/round. No user or
-- project-member identity is stored. The encrypted token is derived from this
-- row's id/cycle_id/expires_at and can be regenerated on demand.
CREATE TABLE public.surveybundle (
  id integer NOT NULL DEFAULT nextval('surveybundle_id_seq'::regclass),
  survey_id integer NOT NULL,
  cycle_id character varying NOT NULL,
  status character varying NOT NULL DEFAULT 'pending', -- 'pending' | 'closed' | 'expired'
  scheduled_send_at timestamp with time zone NOT NULL DEFAULT now(),
  notified_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  delivery_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT surveybundle_pkey PRIMARY KEY (id),
  CONSTRAINT surveybundle_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id),
  CONSTRAINT surveybundle_cycle_id_unique UNIQUE (cycle_id)
);

CREATE TABLE public.surveyresponse (
  id integer NOT NULL DEFAULT nextval('surveyresponse_id_seq'::regclass),
  bundle_id integer NOT NULL,
  submission_key character varying,                  -- client-generated retry key; not a user identity
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT surveyresponse_pkey PRIMARY KEY (id),
  CONSTRAINT surveyresponse_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES public.surveybundle(id)
);
CREATE UNIQUE INDEX surveyresponse_submission_key_idx
  ON public.surveyresponse (bundle_id, submission_key)
  WHERE submission_key IS NOT NULL;

CREATE TABLE public.surveyanswer (
  id integer NOT NULL DEFAULT nextval('surveyanswer_id_seq'::regclass),
  response_id integer NOT NULL,
  question_id integer NOT NULL,
  answer_text text,
  answer_scale integer,
  CONSTRAINT surveyanswer_pkey PRIMARY KEY (id),
  CONSTRAINT surveyanswer_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.surveyresponse(id),
  CONSTRAINT surveyanswer_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.surveyquestion(id),
  CONSTRAINT surveyanswer_response_question_unique UNIQUE (response_id, question_id),
  CONSTRAINT surveyanswer_value_check CHECK (
    (answer_text IS NOT NULL AND answer_scale IS NULL)
    OR (answer_text IS NULL AND answer_scale BETWEEN 1 AND 5)
  )
);

CREATE TABLE public.surveyinsight (
  id integer NOT NULL DEFAULT nextval('surveyinsight_id_seq'::regclass),
  survey_id integer NOT NULL UNIQUE,
  ai_insight text,
  themes text[],
  delivery_score numeric,
  code_quality_score numeric,
  cicd_score numeric,
  team_health_score numeric,
  blockers_score numeric,
  ai_model character varying,
  generated_at timestamp with time zone,
  CONSTRAINT surveyinsight_pkey PRIMARY KEY (id),
  CONSTRAINT surveyinsight_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id)
);

CREATE TABLE public.projecthealthscore (
  id integer NOT NULL DEFAULT nextval('projecthealthscore_id_seq'::regclass),
  project_id integer NOT NULL,
  project_snapshot_id integer,
  survey_id integer,
  delivery_score numeric,
  code_quality_score numeric,
  cicd_score numeric,
  team_health_score numeric,
  blockers_score numeric,
  overall_score numeric,
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT projecthealthscore_pkey PRIMARY KEY (id),
  CONSTRAINT projecthealthscore_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id),
  CONSTRAINT projecthealthscore_snapshot_id_fkey FOREIGN KEY (project_snapshot_id) REFERENCES public.projectsnapshot(id),
  CONSTRAINT projecthealthscore_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id)
);

-- One monthly auto-pulse schedule per project. scheduled_send_at is randomized
-- inside the configured monthly window and assigned before the review period.
CREATE TABLE public.surveyschedule (
  id integer NOT NULL DEFAULT nextval('surveyschedule_id_seq'::regclass),
  project_id integer NOT NULL,
  period_month date NOT NULL,
  scheduled_send_at timestamp with time zone NOT NULL,
  survey_id integer,
  questions_generated_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT surveyschedule_pkey PRIMARY KEY (id),
  CONSTRAINT surveyschedule_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id),
  CONSTRAINT surveyschedule_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id),
  CONSTRAINT surveyschedule_project_month_unique UNIQUE (project_id, period_month)
);

-- Transactional public submission boundary. The implementation also locks and
-- verifies the pending bundle/active survey before inserting.
CREATE FUNCTION public.submit_survey_response(
  p_bundle_id integer,
  p_submission_key character varying,
  p_answers jsonb
) RETURNS integer;

-- Columns added to existing (non-survey-owned) tables:
--   project.pending_survey boolean NOT NULL DEFAULT false            (002)
--   project.pending_survey_trigger character varying                 (002)
--   riskscore.blockers_score double precision                        (002)
