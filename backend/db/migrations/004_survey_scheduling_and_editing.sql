-- Survey feature migration 004.
-- Adds: (1) per-project, per-round auto-pulse scheduling (staggered send time
-- within each round's window, with a question-generation lead time), and
-- (2) post-send question editing metadata (modified tag, first-sent marker).
-- Apply the same way as 002/003 (manual SQL editor / psql), then keep
-- schema.sql in sync.

-- 1. Per-project round scheduling ---------------------------------------------
-- One row per (project, month, round). `scheduled_send_at` is a randomized
-- timestamp within that round's window (see SURVEY_ROUND_WINDOW_DAYS), assigned
-- once when the window opens. Decouples "when does this project's round fire"
-- from the monthly `survey` row itself, since one survey row spans both rounds.
CREATE SEQUENCE IF NOT EXISTS surveyschedule_id_seq;
CREATE TABLE IF NOT EXISTS public.surveyschedule (
  id integer NOT NULL DEFAULT nextval('surveyschedule_id_seq'::regclass),
  project_id integer NOT NULL REFERENCES public.project(id),
  period_month date NOT NULL,
  round smallint NOT NULL, -- 1 | 2
  scheduled_send_at timestamp with time zone NOT NULL,
  survey_id integer REFERENCES public.survey(id), -- filled in once the monthly auto_pulse survey row exists
  questions_generated_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT surveyschedule_pkey PRIMARY KEY (id),
  CONSTRAINT surveyschedule_unique UNIQUE (project_id, period_month, round)
);
CREATE INDEX IF NOT EXISTS surveyschedule_due_gen_idx ON public.surveyschedule (scheduled_send_at) WHERE questions_generated_at IS NULL;
CREATE INDEX IF NOT EXISTS surveyschedule_due_send_idx ON public.surveyschedule (scheduled_send_at) WHERE sent_at IS NULL;

-- 2. Post-send question editing ------------------------------------------------
-- `first_sent_at`: set once, the first time this survey is actually dispatched
-- (manual or auto). Editing questions after this point sets `questions_modified_at`
-- (a "modified" badge) instead of silently rewriting history. Editing is blocked
-- entirely once >=1 response has been submitted (checked at the app layer via
-- the derived response_count, not stored here).
ALTER TABLE public.survey ADD COLUMN IF NOT EXISTS first_sent_at timestamp with time zone;
ALTER TABLE public.survey ADD COLUMN IF NOT EXISTS questions_modified_at timestamp with time zone;
