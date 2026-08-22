-- ============================================================================
-- Consolidated survey-feature migration.
--
-- This applies db/migrations/002_survey.sql,
-- 003_survey_categories.sql, 004_survey_scheduling.sql, and
-- 005_survey_shared_lifecycle.sql,
-- with every CREATE TABLE / CREATE INDEX upgraded to an IF NOT EXISTS guard so
-- the whole file is idempotent - safe to run against a fresh database, a
-- partially-migrated one, or one that's already fully up to date.
--
-- Run it with psql (or paste into the Supabase SQL editor):
--   psql "$DATABASE_URL" -f db/migration.sql
--
-- If you only need one change, run the corresponding numbered file from
-- db/migrations/ instead. Keep db/schema/005_surveys.sql in sync if you hand-edit
-- this file - it documents the resulting "current shape", this file documents
-- how to get there.
-- ============================================================================

-- ── From 002_survey.sql ─────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS survey_id_seq;
CREATE TABLE IF NOT EXISTS public.survey (
  id integer NOT NULL DEFAULT nextval('survey_id_seq'::regclass),
  project_id integer NOT NULL,
  status character varying NOT NULL DEFAULT 'draft',
  source character varying NOT NULL,                 -- 'manual' | 'auto_pulse'
  trigger character varying NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  custom_guidance text,
  target_count integer NOT NULL DEFAULT 0,
  sent_at timestamp with time zone,
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
  survey_id integer NOT NULL,
  cycle_id character varying NOT NULL,
  status character varying NOT NULL DEFAULT 'pending',
  scheduled_send_at timestamp with time zone NOT NULL DEFAULT now(),
  notified_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT surveybundle_pkey PRIMARY KEY (id),
  CONSTRAINT surveybundle_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id)
);
DROP INDEX IF EXISTS surveybundle_cycle_id_idx;
CREATE UNIQUE INDEX surveybundle_cycle_id_idx ON public.surveybundle (cycle_id);
CREATE INDEX IF NOT EXISTS surveybundle_survey_id_idx ON public.surveybundle (survey_id);

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
ALTER TABLE public.riskscore ADD COLUMN IF NOT EXISTS blockers_score double precision;

-- ── From 003_survey_categories.sql ─────────────────────────────────────────

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

-- ── From 004_survey_scheduling.sql ─────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS surveyschedule_id_seq;
CREATE TABLE IF NOT EXISTS public.surveyschedule (
  id integer NOT NULL DEFAULT nextval('surveyschedule_id_seq'::regclass),
  project_id integer NOT NULL REFERENCES public.project(id),
  period_month date NOT NULL,
  scheduled_send_at timestamp with time zone NOT NULL,
  survey_id integer REFERENCES public.survey(id),
  questions_generated_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT surveyschedule_pkey PRIMARY KEY (id),
  CONSTRAINT surveyschedule_project_month_unique UNIQUE (project_id, period_month)
);
CREATE INDEX IF NOT EXISTS surveyschedule_due_gen_idx ON public.surveyschedule (scheduled_send_at) WHERE questions_generated_at IS NULL;
CREATE INDEX IF NOT EXISTS surveyschedule_due_send_idx ON public.surveyschedule (scheduled_send_at) WHERE sent_at IS NULL;

-- ── From 005_survey_shared_lifecycle.sql ────────────────────────────────────

BEGIN;

ALTER TABLE public.surveybundle ADD COLUMN IF NOT EXISTS survey_id integer;

DO $$
BEGIN
  IF to_regclass('public.surveybundlesurvey') IS NOT NULL THEN
    EXECUTE '
      UPDATE public.surveybundle AS bundle
      SET survey_id = link.survey_id
      FROM public.surveybundlesurvey AS link
      WHERE link.bundle_id = bundle.id
        AND bundle.survey_id IS NULL
    ';
  END IF;

  IF EXISTS (SELECT 1 FROM public.surveybundle WHERE survey_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot simplify surveybundle: one or more links have no survey';
  END IF;
END $$;

ALTER TABLE public.surveybundle ALTER COLUMN survey_id SET NOT NULL;
ALTER TABLE public.surveybundle
  DROP CONSTRAINT IF EXISTS surveybundle_user_id_fkey,
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS mode,
  DROP COLUMN IF EXISTS used_at;

UPDATE public.surveybundle SET status = 'closed' WHERE status = 'used';

DROP INDEX IF EXISTS surveybundle_user_id_idx;
DROP TABLE IF EXISTS public.surveybundlesurvey;
DROP SEQUENCE IF EXISTS surveybundlesurvey_id_seq;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surveybundle_survey_id_fkey') THEN
    ALTER TABLE public.surveybundle
      ADD CONSTRAINT surveybundle_survey_id_fkey
      FOREIGN KEY (survey_id) REFERENCES public.survey(id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS surveybundle_cycle_id_idx ON public.surveybundle (cycle_id);
CREATE INDEX IF NOT EXISTS surveybundle_survey_id_idx ON public.surveybundle (survey_id);

ALTER TABLE public.surveybundle
  ADD COLUMN IF NOT EXISTS delivery_results jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.survey
  ALTER COLUMN sent_at DROP NOT NULL,
  ALTER COLUMN sent_at DROP DEFAULT,
  ALTER COLUMN status SET DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS review_deadline_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS scheduled_send_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS close_reason character varying,
  ADD COLUMN IF NOT EXISTS health_context_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS question_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS analysis_error text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey'
      AND column_name = 'first_sent_at'
  ) THEN
    EXECUTE '
      UPDATE public.survey
      SET sent_at = COALESCE(sent_at, first_sent_at)
      WHERE first_sent_at IS NOT NULL
    ';
  END IF;
END $$;

ALTER TABLE public.survey
  DROP COLUMN IF EXISTS response_count,
  DROP COLUMN IF EXISTS first_sent_at,
  DROP COLUMN IF EXISTS questions_modified_at;

CREATE UNIQUE INDEX IF NOT EXISTS survey_auto_month_idx
  ON public.survey (project_id, period_month)
  WHERE source = 'auto_pulse';

DELETE FROM public.surveyschedule AS older
USING public.surveyschedule AS newer
WHERE older.project_id = newer.project_id
  AND older.period_month = newer.period_month
  AND older.id > newer.id;

ALTER TABLE public.surveyschedule
  DROP CONSTRAINT IF EXISTS surveyschedule_unique,
  DROP COLUMN IF EXISTS round;
CREATE UNIQUE INDEX IF NOT EXISTS surveyschedule_project_month_idx
  ON public.surveyschedule (project_id, period_month);

ALTER TABLE public.projectmember
  DROP COLUMN IF EXISTS last_survey_sent_at;

UPDATE public.survey AS survey
SET status = CASE
  WHEN EXISTS (
    SELECT 1 FROM public.surveybundle AS bundle
    WHERE bundle.survey_id = survey.id
      AND bundle.notified_at IS NOT NULL
  ) THEN 'active'
  ELSE 'scheduled'
END
WHERE survey.status = 'sent';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surveyquestion_type_check') THEN
    ALTER TABLE public.surveyquestion
      ADD CONSTRAINT surveyquestion_type_check
      CHECK (question_type IN ('text', 'scale')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surveyanswer_value_check') THEN
    ALTER TABLE public.surveyanswer
      ADD CONSTRAINT surveyanswer_value_check
      CHECK (
        (answer_text IS NOT NULL AND answer_scale IS NULL)
        OR
        (answer_text IS NULL AND answer_scale BETWEEN 1 AND 5)
      ) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS surveyanswer_response_question_idx
  ON public.surveyanswer (response_id, question_id);

ALTER TABLE public.surveyresponse
  ADD COLUMN IF NOT EXISTS submission_key character varying;
DROP INDEX IF EXISTS surveyresponse_submission_key_idx;
CREATE UNIQUE INDEX surveyresponse_submission_key_idx
  ON public.surveyresponse (bundle_id, submission_key)
  WHERE submission_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.submit_survey_response(
  p_bundle_id integer,
  p_submission_key character varying,
  p_answers jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  response_id integer;
  answer jsonb;
BEGIN
  SELECT id INTO response_id
  FROM public.surveyresponse
  WHERE bundle_id = p_bundle_id
    AND submission_key = p_submission_key;
  IF response_id IS NOT NULL THEN
    RETURN response_id;
  END IF;

  PERFORM 1
  FROM public.surveybundle AS bundle
  JOIN public.survey ON survey.id = bundle.survey_id
  WHERE bundle.id = p_bundle_id
    AND bundle.status = 'pending'
    AND bundle.expires_at > now()
    AND survey.status = 'active'
  FOR UPDATE OF bundle;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'survey is not accepting responses';
  END IF;

  INSERT INTO public.surveyresponse (bundle_id, submission_key)
  VALUES (p_bundle_id, p_submission_key)
  ON CONFLICT (bundle_id, submission_key) WHERE submission_key IS NOT NULL DO NOTHING
  RETURNING id INTO response_id;

  IF response_id IS NULL THEN
    SELECT id INTO response_id
    FROM public.surveyresponse
    WHERE bundle_id = p_bundle_id
      AND submission_key = p_submission_key;
    RETURN response_id;
  END IF;

  FOR answer IN SELECT value FROM jsonb_array_elements(p_answers)
  LOOP
    INSERT INTO public.surveyanswer (response_id, question_id, answer_text, answer_scale)
    VALUES (
      response_id,
      (answer->>'questionId')::integer,
      NULLIF(answer->>'answerText', ''),
      CASE WHEN answer ? 'answerScale' THEN (answer->>'answerScale')::integer ELSE NULL END
    );
  END LOOP;

  RETURN response_id;
END;
$$;

COMMIT;
