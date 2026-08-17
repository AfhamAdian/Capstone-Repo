-- Additive catch-up for live databases that still have the pre-005 survey
-- shape (no survey.created_at, no surveybundle.survey_id). Safe to rerun.

BEGIN;

ALTER TABLE public.survey
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS review_deadline_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS scheduled_send_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS close_reason character varying,
  ADD COLUMN IF NOT EXISTS health_context_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS question_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS analysis_error text;

ALTER TABLE public.surveybundle
  ADD COLUMN IF NOT EXISTS survey_id integer,
  ADD COLUMN IF NOT EXISTS delivery_results jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'surveybundle' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.surveybundle ALTER COLUMN user_id DROP NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'surveybundle' AND column_name = 'mode'
  ) THEN
    EXECUTE 'ALTER TABLE public.surveybundle ALTER COLUMN mode DROP NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'surveybundle_survey_id_fkey'
  ) THEN
    ALTER TABLE public.surveybundle
      ADD CONSTRAINT surveybundle_survey_id_fkey
      FOREIGN KEY (survey_id) REFERENCES public.survey(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS surveybundle_survey_id_idx ON public.surveybundle (survey_id);

ALTER TABLE public.surveyresponse
  ADD COLUMN IF NOT EXISTS submission_key character varying;

COMMIT;
