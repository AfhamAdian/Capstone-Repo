-- Compact the survey feature onto two tables: survey + survey_response.
--
-- RUN THIS FILE in the Supabase SQL editor (or psql). It is the only survey
-- migration you need to apply now.
--
-- Do not edit or re-run 002–006; those already ran (or were written for live
-- Supabase). Do not run db/schema/005_surveys.sql — that file is a reference
-- dump, not a migration.
--
-- This script is additive and idempotent: it upgrades both the pre-005 live
-- shape and any database that already received 005/006, copies leftover rows
-- into the compact columns, then drops the unused survey tables.
-- Safe to rerun.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Compact columns on survey (covers missing 005/006 columns too)
-- ---------------------------------------------------------------------------

ALTER TABLE public.survey
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS scheduled_send_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS close_reason character varying,
  ADD COLUMN IF NOT EXISTS health_context jsonb,
  ADD COLUMN IF NOT EXISTS analysis_error text,
  ADD COLUMN IF NOT EXISTS questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cycle_id character varying,
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS notified_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS delivery jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS insight jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'survey' AND column_name = 'health_context_snapshot'
  ) THEN
    UPDATE public.survey
    SET health_context = health_context_snapshot
    WHERE health_context IS NULL
      AND health_context_snapshot IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS survey_project_id_idx ON public.survey (project_id);
CREATE INDEX IF NOT EXISTS survey_source_period_idx ON public.survey (project_id, source, period_month);
CREATE UNIQUE INDEX IF NOT EXISTS survey_cycle_id_idx
  ON public.survey (cycle_id)
  WHERE cycle_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS survey_auto_pulse_period_idx
  ON public.survey (project_id, period_month)
  WHERE source = 'auto_pulse' AND period_month IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Copy questions / insight / schedule / link fields from leftover tables
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.surveyquestion') IS NOT NULL THEN
    UPDATE public.survey AS s
    SET questions = COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'category', q.category,
          'questionText', q.question_text,
          'questionType', q.question_type
        )
        ORDER BY q.order_index, q.id
      )
      FROM public.surveyquestion AS q
      WHERE q.survey_id = s.id
    ), s.questions)
    WHERE EXISTS (
      SELECT 1 FROM public.surveyquestion AS q WHERE q.survey_id = s.id
    )
    AND (
      s.questions IS NULL
      OR s.questions = '[]'::jsonb
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.surveyinsight') IS NOT NULL THEN
    UPDATE public.survey AS s
    SET insight = jsonb_build_object(
      'aiInsight', i.ai_insight,
      'themes', to_jsonb(COALESCE(i.themes, ARRAY[]::text[])),
      'scores', jsonb_build_object(
        'delivery', i.delivery_score,
        'codeQuality', i.code_quality_score,
        'cicd', i.cicd_score,
        'teamHealth', i.team_health_score,
        'blockers', i.blockers_score
      ),
      'aiModel', i.ai_model,
      'generatedAt', i.generated_at
    )
    FROM public.surveyinsight AS i
    WHERE i.survey_id = s.id
      AND s.insight IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.surveyschedule') IS NOT NULL THEN
    UPDATE public.survey AS s
    SET
      scheduled_send_at = COALESCE(s.scheduled_send_at, sch.scheduled_send_at),
      period_month = COALESCE(s.period_month, sch.period_month)
    FROM public.surveyschedule AS sch
    WHERE sch.survey_id = s.id;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.surveybundle') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'surveybundle' AND column_name = 'survey_id'
     ) THEN
    RETURN;
  END IF;

  UPDATE public.survey AS s
  SET
    cycle_id = COALESCE(s.cycle_id, b.cycle_id),
    expires_at = COALESCE(s.expires_at, b.expires_at),
    notified_at = COALESCE(s.notified_at, b.notified_at)
  FROM (
    SELECT DISTINCT ON (survey_id) survey_id, cycle_id, expires_at, notified_at
    FROM public.surveybundle
    WHERE survey_id IS NOT NULL
    ORDER BY survey_id, id DESC
  ) AS b
  WHERE b.survey_id = s.id
    AND s.cycle_id IS NULL;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'surveybundle' AND column_name = 'delivery_results'
  ) THEN
    EXECUTE $sql$
      UPDATE public.survey AS s
      SET delivery = COALESCE(NULLIF(s.delivery, '{}'::jsonb), b.delivery_results, '{}'::jsonb)
      FROM (
        SELECT DISTINCT ON (survey_id) survey_id, delivery_results
        FROM public.surveybundle
        WHERE survey_id IS NOT NULL
        ORDER BY survey_id, id DESC
      ) AS b
      WHERE b.survey_id = s.id
        AND (s.delivery IS NULL OR s.delivery = '{}'::jsonb)
    $sql$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. survey_response
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS survey_response_id_seq;

CREATE TABLE IF NOT EXISTS public.survey_response (
  id integer NOT NULL DEFAULT nextval('survey_response_id_seq'::regclass),
  survey_id integer NOT NULL,
  submission_key uuid NOT NULL,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT survey_response_pkey PRIMARY KEY (id),
  CONSTRAINT survey_response_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id),
  CONSTRAINT survey_response_survey_submission_unique UNIQUE (survey_id, submission_key)
);

CREATE INDEX IF NOT EXISTS survey_response_survey_id_idx ON public.survey_response (survey_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_questions_array_check') THEN
    ALTER TABLE public.survey
      ADD CONSTRAINT survey_questions_array_check
      CHECK (jsonb_typeof(questions) = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_response_answers_array_check') THEN
    ALTER TABLE public.survey_response
      ADD CONSTRAINT survey_response_answers_array_check
      CHECK (jsonb_typeof(answers) = 'array');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.surveyresponse') IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('public.surveyanswer') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'surveybundle' AND column_name = 'survey_id'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'surveyresponse' AND column_name = 'bundle_id'
     ) THEN
    INSERT INTO public.survey_response (survey_id, submission_key, submitted_at, answers)
    SELECT
      bundle.survey_id,
      CASE
        WHEN (to_jsonb(r)->>'submission_key') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (to_jsonb(r)->>'submission_key')::uuid
        ELSE gen_random_uuid()
      END,
      r.submitted_at,
      COALESCE((
        SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'questionId', a.question_id,
          'answerText', a.answer_text,
          'answerScale', a.answer_scale
        )) ORDER BY a.id)
        FROM public.surveyanswer AS a
        WHERE a.response_id = r.id
      ), '[]'::jsonb)
    FROM public.surveyresponse AS r
    JOIN public.surveybundle AS bundle ON bundle.id = r.bundle_id
    WHERE bundle.survey_id IS NOT NULL
    ON CONFLICT (survey_id, submission_key) DO NOTHING;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'surveyresponse' AND column_name = 'survey_id'
  ) THEN
    INSERT INTO public.survey_response (survey_id, submission_key, submitted_at, answers)
    SELECT
      r.survey_id,
      CASE
        WHEN (to_jsonb(r)->>'submission_key') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (to_jsonb(r)->>'submission_key')::uuid
        ELSE gen_random_uuid()
      END,
      r.submitted_at,
      CASE
        WHEN to_regclass('public.surveyanswer') IS NULL THEN '[]'::jsonb
        ELSE COALESCE((
          SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'questionId', a.question_id,
            'answerText', a.answer_text,
            'answerScale', a.answer_scale
          )) ORDER BY a.id)
          FROM public.surveyanswer AS a
          WHERE a.response_id = r.id
        ), '[]'::jsonb)
      END
    FROM public.surveyresponse AS r
    WHERE r.survey_id IS NOT NULL
    ON CONFLICT (survey_id, submission_key) DO NOTHING;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Collapse leftover lifecycle statuses
-- ---------------------------------------------------------------------------

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'survey'
      AND con.contype = 'c'
      AND (
        pg_get_constraintdef(con.oid) ILIKE '%status%'
        OR pg_get_constraintdef(con.oid) ILIKE '%source%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.survey DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

UPDATE public.survey
SET status = CASE
  WHEN status IN ('sent', 'sending', 'in_review', 'scheduled', 'analyzing') AND sent_at IS NOT NULL THEN 'active'
  WHEN status IN ('in_review', 'scheduled', 'sending') THEN 'draft'
  WHEN status = 'sent' THEN 'active'
  WHEN status = 'analyzing' THEN 'closed'
  ELSE status
END
WHERE status IN ('sent', 'sending', 'in_review', 'scheduled', 'analyzing');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_status_check') THEN
    ALTER TABLE public.survey
      ADD CONSTRAINT survey_status_check
      CHECK (status IN ('draft', 'active', 'paused', 'closed', 'completed', 'cancelled', 'failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_source_check') THEN
    ALTER TABLE public.survey
      ADD CONSTRAINT survey_source_check
      CHECK (source IN ('manual', 'auto_pulse'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Replace the public submit RPC
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.submit_survey_response(integer, character varying, jsonb);
DROP FUNCTION IF EXISTS public.submit_survey_response(integer, uuid, jsonb);

CREATE FUNCTION public.submit_survey_response(
  p_survey_id integer,
  p_submission_key uuid,
  p_answers jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  response_id integer;
BEGIN
  SELECT id INTO response_id
  FROM public.survey_response
  WHERE survey_id = p_survey_id
    AND submission_key = p_submission_key;
  IF response_id IS NOT NULL THEN
    RETURN response_id;
  END IF;

  PERFORM 1
  FROM public.survey
  WHERE id = p_survey_id
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'survey is not accepting responses';
  END IF;

  INSERT INTO public.survey_response (survey_id, submission_key, answers)
  VALUES (p_survey_id, p_submission_key, COALESCE(p_answers, '[]'::jsonb))
  ON CONFLICT (survey_id, submission_key) DO NOTHING
  RETURNING id INTO response_id;

  IF response_id IS NULL THEN
    SELECT id INTO response_id
    FROM public.survey_response
    WHERE survey_id = p_survey_id
      AND submission_key = p_submission_key;
  END IF;

  RETURN response_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_survey_response(integer, uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Drop unused survey plumbing (keep survey + survey_response + health)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.submit_survey_response(integer, character varying, jsonb);

DROP TABLE IF EXISTS public.surveyanswer CASCADE;
DROP TABLE IF EXISTS public.surveyresponse CASCADE;
DROP TABLE IF EXISTS public.surveyquestion CASCADE;
DROP TABLE IF EXISTS public.surveyinsight CASCADE;
DROP TABLE IF EXISTS public.surveyschedule CASCADE;
DROP TABLE IF EXISTS public.surveybundlesurvey CASCADE;
DROP TABLE IF EXISTS public.surveybundle CASCADE;
DROP TABLE IF EXISTS public.surveycategory CASCADE;

DROP SEQUENCE IF EXISTS surveyanswer_id_seq;
DROP SEQUENCE IF EXISTS surveyresponse_id_seq;
DROP SEQUENCE IF EXISTS surveyquestion_id_seq;
DROP SEQUENCE IF EXISTS surveyinsight_id_seq;
DROP SEQUENCE IF EXISTS surveyschedule_id_seq;
DROP SEQUENCE IF EXISTS surveybundlesurvey_id_seq;
DROP SEQUENCE IF EXISTS surveybundle_id_seq;
DROP SEQUENCE IF EXISTS surveycategory_id_seq;

ALTER TABLE public.survey
  DROP COLUMN IF EXISTS review_deadline_at,
  DROP COLUMN IF EXISTS question_version,
  DROP COLUMN IF EXISTS response_count,
  DROP COLUMN IF EXISTS first_sent_at,
  DROP COLUMN IF EXISTS questions_modified_at,
  DROP COLUMN IF EXISTS health_context_snapshot;

COMMIT;
