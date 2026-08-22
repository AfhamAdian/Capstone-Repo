-- Survey feature migration 005.
-- Simplifies delivery to the single supported model: one anonymous shared
-- link per survey cycle, broadcast to team channels. It also adds the compact
-- lifecycle and health-context fields needed for review-window auto-send.

BEGIN;

-- A shared link belongs directly to one survey. Migrate any existing links
-- from the former multi-mode join table before removing that dead complexity.
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
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'surveybundle_survey_id_fkey'
  ) THEN
    ALTER TABLE public.surveybundle
      ADD CONSTRAINT surveybundle_survey_id_fkey
      FOREIGN KEY (survey_id) REFERENCES public.survey(id);
  END IF;
END $$;

DROP INDEX IF EXISTS surveybundle_cycle_id_idx;
CREATE UNIQUE INDEX surveybundle_cycle_id_idx
  ON public.surveybundle (cycle_id);
CREATE INDEX IF NOT EXISTS surveybundle_survey_id_idx
  ON public.surveybundle (survey_id);

-- Delivery is channel-wide. Keep its small result payload on the link row
-- instead of introducing a delivery-attempt table.
ALTER TABLE public.surveybundle
  ADD COLUMN IF NOT EXISTS delivery_results jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Draft/review/send/close lifecycle. sent_at now means the real dispatch time,
-- not the row creation time.
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

-- A shared channel cannot target a private 50/50 cohort. Keep one monthly
-- schedule per project and remove per-member survey-delivery tracking.
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

-- New rows are validated without forcing historical data cleanup during this
-- migration. Application validation mirrors these constraints.
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

-- One RPC keeps the response row and all answers in a single transaction.
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
    INSERT INTO public.surveyanswer (
      response_id,
      question_id,
      answer_text,
      answer_scale
    ) VALUES (
      response_id,
      (answer->>'questionId')::integer,
      NULLIF(answer->>'answerText', ''),
      CASE
        WHEN answer ? 'answerScale' THEN (answer->>'answerScale')::integer
        ELSE NULL
      END
    );
  END LOOP;

  RETURN response_id;
END;
$$;

COMMIT;
