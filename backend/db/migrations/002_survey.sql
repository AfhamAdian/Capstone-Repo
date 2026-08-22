-- Survey feature migration.
-- Unlike schema.sql (context-only reference), this file is meant to be run
-- against the real Supabase project's SQL editor (or psql via DATABASE_URL).
-- No migration runner exists in this repo yet, so apply this manually and keep
-- schema.sql in sync afterward by re-exporting the schema.

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
  category character varying NOT NULL, -- 'delivery' | 'codeQuality' | 'cicd' | 'teamHealth' | 'blockers'
  question_text text NOT NULL,
  question_type character varying NOT NULL, -- 'text' | 'scale'
  order_index integer NOT NULL,
  CONSTRAINT surveyquestion_pkey PRIMARY KEY (id),
  CONSTRAINT surveyquestion_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id)
);
CREATE INDEX IF NOT EXISTS surveyquestion_survey_id_idx ON public.surveyquestion (survey_id);

-- One anonymous shared link per survey distribution event.
-- No token/hash column: the link is an encrypted payload derived from this
-- row's own id/cycle_id/expires_at (see backend/libs/security/survey-token.ts),
-- regenerated on demand, never persisted.
CREATE SEQUENCE IF NOT EXISTS surveybundle_id_seq;
CREATE TABLE IF NOT EXISTS public.surveybundle (
  id integer NOT NULL DEFAULT nextval('surveybundle_id_seq'::regclass),
  survey_id integer NOT NULL,
  cycle_id character varying NOT NULL,
  status character varying NOT NULL DEFAULT 'pending', -- 'pending' | 'closed' | 'expired'
  scheduled_send_at timestamp with time zone NOT NULL DEFAULT now(),
  notified_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT surveybundle_pkey PRIMARY KEY (id),
  CONSTRAINT surveybundle_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS surveybundle_cycle_id_idx ON public.surveybundle (cycle_id);
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

-- Existing table changes
ALTER TABLE public.project ADD COLUMN IF NOT EXISTS pending_survey boolean NOT NULL DEFAULT false;
ALTER TABLE public.project ADD COLUMN IF NOT EXISTS pending_survey_trigger character varying;
ALTER TABLE public.riskscore ADD COLUMN IF NOT EXISTS blockers_score double precision;
