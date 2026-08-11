-- Survey feature migration 004.
-- Adds one randomized monthly auto-pulse schedule per project. The worker
-- creates this row before the send window so managers receive a review period.

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

CREATE INDEX IF NOT EXISTS surveyschedule_due_gen_idx
  ON public.surveyschedule (scheduled_send_at)
  WHERE questions_generated_at IS NULL;
CREATE INDEX IF NOT EXISTS surveyschedule_due_send_idx
  ON public.surveyschedule (scheduled_send_at)
  WHERE sent_at IS NULL;
