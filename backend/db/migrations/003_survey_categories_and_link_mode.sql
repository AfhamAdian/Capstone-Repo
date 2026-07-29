-- Survey feature migration 003.
-- Adds: (1) admin-managed custom survey categories, (2) a per-bundle link
-- "mode" so the distribution layer can switch between one shared anonymous
-- link per cycle (default) and per-developer single-use links without a
-- schema change. Apply the same way as 002 (manual SQL editor / psql), then
-- keep schema.sql in sync.

-- 1. Custom survey categories -------------------------------------------------
-- Questions still reference a category by its string `key` (as they do today),
-- but the set of valid keys is now data-driven. Each category maps to one of
-- the five canonical rubric buckets via `rubric_category`, so scoring/blending
-- keeps working even for admin-created categories. The five built-ins are
-- seeded here and flagged is_builtin so they can't be deleted.
CREATE SEQUENCE IF NOT EXISTS surveycategory_id_seq;
CREATE TABLE IF NOT EXISTS public.surveycategory (
  id integer NOT NULL DEFAULT nextval('surveycategory_id_seq'::regclass),
  key character varying NOT NULL,
  label character varying NOT NULL,
  description text,
  rubric_category character varying NOT NULL, -- 'delivery' | 'codeQuality' | 'cicd' | 'teamHealth' | 'blockers'
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

-- 2. Per-bundle link mode -----------------------------------------------------
-- 'shared'      => one anonymous link per cycle, reusable by the whole cohort
--                  (submission does NOT consume the bundle).
-- 'single_use'  => per-developer link, atomically consumed on first submit.
-- Default 'shared' matches the currently-selected distribution strategy; flip
-- via SURVEY_LINK_MODE without touching this column's default.
ALTER TABLE public.surveybundle
  ADD COLUMN IF NOT EXISTS mode character varying NOT NULL DEFAULT 'shared';

-- A shared bundle represents a whole cohort, not one developer, so it has no
-- single owning user or membership row. Relax these NOT NULLs (single-use
-- bundles still populate them). last_survey_sent_at is instead written per
-- notified member directly by the distribution processor.
ALTER TABLE public.surveybundle ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.surveybundlesurvey ALTER COLUMN project_member_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS surveybundle_cycle_id_idx ON public.surveybundle (cycle_id);
