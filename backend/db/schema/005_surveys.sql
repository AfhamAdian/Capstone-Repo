-- WARNING: This schema is for context only and is not meant to be run.
-- Current-state reference for the survey feature: the merged result of
-- db/migrations/002_survey.sql + 003_survey_categories_and_link_mode.sql +
-- 004_survey_scheduling_and_editing.sql, the same way schema.sql documents
-- "current shape" rather than history for the base tables. To actually apply
-- these changes to a live database, run db/migration.sql (or the individual
-- numbered files in db/migrations/), not this file.
-- Depends on: 002_projects.sql (project, projectmember), 004_risk.sql (riskscore)

CREATE TABLE public.survey (
  id integer NOT NULL DEFAULT nextval('survey_id_seq'::regclass),
  project_id integer NOT NULL,
  status character varying NOT NULL DEFAULT 'sent', -- 'active' | 'sent' | 'completed'
  source character varying NOT NULL,                 -- 'manual' | 'auto_pulse'
  trigger character varying NOT NULL,
  custom_guidance text,
  target_count integer NOT NULL DEFAULT 0,
  response_count integer NOT NULL DEFAULT 0,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  period_month date,
  first_sent_at timestamp with time zone,           -- added in 004: set once, first real dispatch
  questions_modified_at timestamp with time zone,    -- added in 004: "modified since sent" tag
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

-- One link/token per DEVELOPER (single_use mode) or per COHORT (shared mode,
-- user_id NULL) per distribution event/round. No token/hash column: the link
-- is an encrypted payload derived from this row's own id/cycle_id/expires_at
-- (see backend/libs/security/survey-token.ts), regenerated on demand.
CREATE TABLE public.surveybundle (
  id integer NOT NULL DEFAULT nextval('surveybundle_id_seq'::regclass),
  user_id integer,                                    -- nullable since 003: NULL for shared cohort bundles
  cycle_id character varying NOT NULL,
  status character varying NOT NULL DEFAULT 'pending', -- 'pending' | 'used' | 'expired'
  mode character varying NOT NULL DEFAULT 'shared',     -- added in 003: 'shared' | 'single_use'
  scheduled_send_at timestamp with time zone NOT NULL DEFAULT now(),
  notified_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  CONSTRAINT surveybundle_pkey PRIMARY KEY (id),
  CONSTRAINT surveybundle_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."User"(id)
);

CREATE TABLE public.surveybundlesurvey (
  id integer NOT NULL DEFAULT nextval('surveybundlesurvey_id_seq'::regclass),
  bundle_id integer NOT NULL,
  survey_id integer NOT NULL,
  project_member_id integer,                          -- nullable since 003 (shared bundles have no single membership row)
  CONSTRAINT surveybundlesurvey_pkey PRIMARY KEY (id),
  CONSTRAINT surveybundlesurvey_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES public.surveybundle(id),
  CONSTRAINT surveybundlesurvey_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id),
  CONSTRAINT surveybundlesurvey_project_member_id_fkey FOREIGN KEY (project_member_id) REFERENCES public.projectmember(id),
  CONSTRAINT surveybundlesurvey_bundle_survey_unique UNIQUE (bundle_id, survey_id)
);

CREATE TABLE public.surveyresponse (
  id integer NOT NULL DEFAULT nextval('surveyresponse_id_seq'::regclass),
  bundle_id integer NOT NULL,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT surveyresponse_pkey PRIMARY KEY (id),
  CONSTRAINT surveyresponse_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES public.surveybundle(id)
);

CREATE TABLE public.surveyanswer (
  id integer NOT NULL DEFAULT nextval('surveyanswer_id_seq'::regclass),
  response_id integer NOT NULL,
  question_id integer NOT NULL,
  answer_text text,
  answer_scale integer,
  CONSTRAINT surveyanswer_pkey PRIMARY KEY (id),
  CONSTRAINT surveyanswer_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.surveyresponse(id),
  CONSTRAINT surveyanswer_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.surveyquestion(id)
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

-- Per-project, per-round auto-pulse scheduling (added in 004). One row per
-- (project, month, round); scheduled_send_at is a randomized timestamp within
-- that round's window, decided once when the window opens.
CREATE TABLE public.surveyschedule (
  id integer NOT NULL DEFAULT nextval('surveyschedule_id_seq'::regclass),
  project_id integer NOT NULL,
  period_month date NOT NULL,
  round smallint NOT NULL, -- 1 | 2
  scheduled_send_at timestamp with time zone NOT NULL,
  survey_id integer,
  questions_generated_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT surveyschedule_pkey PRIMARY KEY (id),
  CONSTRAINT surveyschedule_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id),
  CONSTRAINT surveyschedule_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id),
  CONSTRAINT surveyschedule_unique UNIQUE (project_id, period_month, round)
);

-- Columns added to existing (non-survey-owned) tables:
--   project.pending_survey boolean NOT NULL DEFAULT false            (002)
--   project.pending_survey_trigger character varying                 (002)
--   projectmember.last_survey_sent_at timestamp with time zone        (002)
--   riskscore.blockers_score double precision                        (002)
