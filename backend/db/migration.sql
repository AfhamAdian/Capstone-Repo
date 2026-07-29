-- ============================================================================
-- Consolidated survey-feature migration.
--
-- This is the concatenation of db/migrations/002_survey.sql +
-- 003_survey_categories_and_link_mode.sql + 004_survey_scheduling_and_editing.sql,
-- with every CREATE TABLE / CREATE INDEX upgraded to an IF NOT EXISTS guard so
-- the whole file is idempotent - safe to run against a fresh database, a
-- partially-migrated one, or one that's already fully up to date.
--
-- Run it with psql (or paste into the Supabase SQL editor):
--   psql "$DATABASE_URL" -f db/migration.sql
--
-- If you only need ONE of the three changes (e.g. you're already on 003 and
-- just need 004's additions), run the individual numbered file from
-- db/migrations/ instead. Keep db/schema/005_surveys.sql in sync if you hand-edit
-- this file - it documents the resulting "current shape", this file documents
-- how to get there.
-- ============================================================================

-- ── From 002_survey.sql ─────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS survey_id_seq;
CREATE TABLE IF NOT EXISTS public.survey (
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
  CONSTRAINT survey_pkey PRIMARY KEY (id),
  CONSTRAINT survey_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id)
);
CREATE INDEX IF NOT EXISTS survey_project_id_idx ON public.survey (project_id);
CREATE INDEX IF NOT EXISTS survey_source_period_idx ON public.survey (project_id, source, period_month);

CREATE SEQUENCE IF NOT EXISTS surveyquestion_id_seq;
CREATE TABLE IF NOT EXISTS public.surveyquestion (
  id integer NOT NULL DEFAULT nextval('surveyquestion_id_seq'::regclass),
  survey_id integer NOT NULL,
  category character varying NOT NULL,
  question_text text NOT NULL,
  question_type character varying NOT NULL, -- 'text' | 'scale'
  order_index integer NOT NULL,
  CONSTRAINT surveyquestion_pkey PRIMARY KEY (id),
  CONSTRAINT surveyquestion_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id)
);
CREATE INDEX IF NOT EXISTS surveyquestion_survey_id_idx ON public.surveyquestion (survey_id);

CREATE SEQUENCE IF NOT EXISTS surveybundle_id_seq;
CREATE TABLE IF NOT EXISTS public.surveybundle (
  id integer NOT NULL DEFAULT nextval('surveybundle_id_seq'::regclass),
  user_id integer NOT NULL,
  cycle_id character varying NOT NULL,
  status character varying NOT NULL DEFAULT 'pending', -- 'pending' | 'used' | 'expired'
  scheduled_send_at timestamp with time zone NOT NULL DEFAULT now(),
  notified_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  CONSTRAINT surveybundle_pkey PRIMARY KEY (id),
  CONSTRAINT surveybundle_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."User"(id)
);
CREATE INDEX IF NOT EXISTS surveybundle_user_id_idx ON public.surveybundle (user_id);

CREATE SEQUENCE IF NOT EXISTS surveybundlesurvey_id_seq;
CREATE TABLE IF NOT EXISTS public.surveybundlesurvey (
  id integer NOT NULL DEFAULT nextval('surveybundlesurvey_id_seq'::regclass),
  bundle_id integer NOT NULL,
  survey_id integer NOT NULL,
  project_member_id integer NOT NULL,
  CONSTRAINT surveybundlesurvey_pkey PRIMARY KEY (id),
  CONSTRAINT surveybundlesurvey_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES public.surveybundle(id),
  CONSTRAINT surveybundlesurvey_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id),
  CONSTRAINT surveybundlesurvey_project_member_id_fkey FOREIGN KEY (project_member_id) REFERENCES public.projectmember(id),
  CONSTRAINT surveybundlesurvey_bundle_survey_unique UNIQUE (bundle_id, survey_id)
);
CREATE INDEX IF NOT EXISTS surveybundlesurvey_survey_id_idx ON public.surveybundlesurvey (survey_id);
CREATE INDEX IF NOT EXISTS surveybundlesurvey_bundle_id_idx ON public.surveybundlesurvey (bundle_id);

CREATE SEQUENCE IF NOT EXISTS surveyresponse_id_seq;
CREATE TABLE IF NOT EXISTS public.surveyresponse (
  id integer NOT NULL DEFAULT nextval('surveyresponse_id_seq'::regclass),
  bundle_id integer NOT NULL,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT surveyresponse_pkey PRIMARY KEY (id),
  CONSTRAINT surveyresponse_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES public.surveybundle(id)
);

CREATE SEQUENCE IF NOT EXISTS surveyanswer_id_seq;
CREATE TABLE IF NOT EXISTS public.surveyanswer (
  id integer NOT NULL DEFAULT nextval('surveyanswer_id_seq'::regclass),
  response_id integer NOT NULL,
  question_id integer NOT NULL,
  answer_text text,
  answer_scale integer,
  CONSTRAINT surveyanswer_pkey PRIMARY KEY (id),
  CONSTRAINT surveyanswer_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.surveyresponse(id),
  CONSTRAINT surveyanswer_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.surveyquestion(id)
);
CREATE INDEX IF NOT EXISTS surveyanswer_question_id_idx ON public.surveyanswer (question_id);

CREATE SEQUENCE IF NOT EXISTS surveyinsight_id_seq;
CREATE TABLE IF NOT EXISTS public.surveyinsight (
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

CREATE SEQUENCE IF NOT EXISTS projecthealthscore_id_seq;
CREATE TABLE IF NOT EXISTS public.projecthealthscore (
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
CREATE INDEX IF NOT EXISTS projecthealthscore_project_id_idx ON public.projecthealthscore (project_id, computed_at DESC);

ALTER TABLE public.project ADD COLUMN IF NOT EXISTS pending_survey boolean NOT NULL DEFAULT false;
ALTER TABLE public.project ADD COLUMN IF NOT EXISTS pending_survey_trigger character varying;
ALTER TABLE public.projectmember ADD COLUMN IF NOT EXISTS last_survey_sent_at timestamp with time zone;
ALTER TABLE public.riskscore ADD COLUMN IF NOT EXISTS blockers_score double precision;

-- ── From 003_survey_categories_and_link_mode.sql ────────────────────────────

CREATE SEQUENCE IF NOT EXISTS surveycategory_id_seq;
CREATE TABLE IF NOT EXISTS public.surveycategory (
  id integer NOT NULL DEFAULT nextval('surveycategory_id_seq'::regclass),
  key character varying NOT NULL,
  label character varying NOT NULL,
  description text,
  rubric_category character varying NOT NULL,
  is_builtin boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT surveycategory_pkey PRIMARY KEY (id),
  CONSTRAINT surveycategory_key_unique UNIQUE (key)
);

INSERT INTO public.surveycategory (key, label, description, rubric_category, is_builtin)
VALUES
  ('delivery',    'Delivery',     'Shipping cadence, sprint predictability, scope confidence', 'delivery',    true),
  ('codeQuality', 'Code Quality', 'Maintainability, tech debt, review quality',                'codeQuality', true),
  ('cicd',        'CI/CD',        'Pipeline reliability, build/deploy friction',               'cicd',        true),
  ('teamHealth',  'Team Health',  'Morale, workload, collaboration, sustainability',           'teamHealth',  true),
  ('blockers',    'Blockers',     'Dependencies, waiting, impediments to flow',                'blockers',    true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.surveybundle
  ADD COLUMN IF NOT EXISTS mode character varying NOT NULL DEFAULT 'shared';

ALTER TABLE public.surveybundle ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.surveybundlesurvey ALTER COLUMN project_member_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS surveybundle_cycle_id_idx ON public.surveybundle (cycle_id);

-- ── From 004_survey_scheduling_and_editing.sql ──────────────────────────────

CREATE SEQUENCE IF NOT EXISTS surveyschedule_id_seq;
CREATE TABLE IF NOT EXISTS public.surveyschedule (
  id integer NOT NULL DEFAULT nextval('surveyschedule_id_seq'::regclass),
  project_id integer NOT NULL REFERENCES public.project(id),
  period_month date NOT NULL,
  round smallint NOT NULL,
  scheduled_send_at timestamp with time zone NOT NULL,
  survey_id integer REFERENCES public.survey(id),
  questions_generated_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT surveyschedule_pkey PRIMARY KEY (id),
  CONSTRAINT surveyschedule_unique UNIQUE (project_id, period_month, round)
);
CREATE INDEX IF NOT EXISTS surveyschedule_due_gen_idx ON public.surveyschedule (scheduled_send_at) WHERE questions_generated_at IS NULL;
CREATE INDEX IF NOT EXISTS surveyschedule_due_send_idx ON public.surveyschedule (scheduled_send_at) WHERE sent_at IS NULL;

ALTER TABLE public.survey ADD COLUMN IF NOT EXISTS first_sent_at timestamp with time zone;
ALTER TABLE public.survey ADD COLUMN IF NOT EXISTS questions_modified_at timestamp with time zone;

-- ── From 005_discord_user_id.sql ────────────────────────────────────────────

ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS discord_user_id character varying;
