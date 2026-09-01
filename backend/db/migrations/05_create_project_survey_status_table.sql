-- Relocates the "is this project due for a survey" signal out of project.pending_survey /
-- project.pending_survey_trigger into its own table. Nothing reads/writes this table yet -
-- project.pending_survey* stay in place and unchanged for now.
CREATE TABLE IF NOT EXISTS public.project_survey_status (
  project_id integer PRIMARY KEY REFERENCES public.project(id),
  pending_survey boolean NOT NULL DEFAULT false,
  pending_survey_trigger character varying,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
