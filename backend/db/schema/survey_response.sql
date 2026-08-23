-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.survey_response (
  id integer NOT NULL DEFAULT nextval('survey_response_id_seq'::regclass),
  survey_id integer NOT NULL,
  submission_key uuid NOT NULL,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  answers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(answers) = 'array'::text),
  CONSTRAINT survey_response_pkey PRIMARY KEY (id),
  CONSTRAINT survey_response_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(id)
);
