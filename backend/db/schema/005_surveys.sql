-- WARNING: This schema is for context only and is not meant to be run.
-- Current-state reference for the survey feature after
-- db/migrations/007_survey_compact.sql. Historical numbered files 002–006
-- remain in db/migrations/ as already-applied history and must not be
-- edited. To apply the compact model to a live database, run 007 only.
-- Depends on: 002_projects.sql (project, projectmember), 004_risk.sql (riskscore)

CREATE TABLE public.survey (
  id integer NOT NULL DEFAULT nextval('survey_id_seq'::regclass),
  project_id integer NOT NULL,
  status character varying NOT NULL DEFAULT 'draft', -- draft|active|paused|closed|completed|cancelled|failed
  source character varying NOT NULL,                 -- 'manual' | 'auto_pulse'
  trigger character varying NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  custom_guidance text,
  period_month date,
  scheduled_send_at timestamp with time zone,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,      -- [{ id, category, questionText, questionType }]
  cycle_id character varying,                        -- anonymous shared-link id
  expires_at timestamp with time zone,
  notified_at timestamp with time zone,
  delivery jsonb NOT NULL DEFAULT '{}'::jsonb,       -- { slackSent, telegramSent, discordSent }
  target_count integer NOT NULL DEFAULT 0,
  sent_at timestamp with time zone,
  closed_at timestamp with time zone,
  close_reason character varying,
  completed_at timestamp with time zone,
  health_context jsonb,
  insight jsonb,                                     -- { aiInsight, themes, scores, aiModel, generatedAt }
  analysis_error text,
  CONSTRAINT survey_pkey PRIMARY KEY (id),
  CONSTRAINT survey_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id),
  CONSTRAINT survey_status_check CHECK (status IN ('draft', 'active', 'paused', 'closed', 'completed', 'cancelled', 'failed')),
  CONSTRAINT survey_source_check CHECK (source IN ('manual', 'auto_pulse'))
);

CREATE TABLE public.survey_response (
  id integer NOT NULL DEFAULT nextval('survey_response_id_seq'::regclass),
  survey_id integer NOT NULL,
  submission_key uuid NOT NULL,                      -- client-generated retry key; not a user identity
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,        -- [{ questionId, answerText?, answerScale? }]
  CONSTRAINT survey_response_pkey PRIMARY KEY (id),
  CONSTRAINT survey_response_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id),
  CONSTRAINT survey_response_survey_submission_unique UNIQUE (survey_id, submission_key)
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

CREATE FUNCTION public.submit_survey_response(
  p_survey_id integer,
  p_submission_key uuid,
  p_answers jsonb
) RETURNS integer;

-- Columns added to existing (non-survey-owned) tables:
--   project.pending_survey boolean NOT NULL DEFAULT false            (002)
--   project.pending_survey_trigger character varying                 (002)
--   riskscore.blockers_score double precision                        (002)
--
-- Dropped by 007 (do not recreate): surveyquestion, surveyanswer,
-- surveybundle, surveyschedule, surveyinsight, surveycategory.
