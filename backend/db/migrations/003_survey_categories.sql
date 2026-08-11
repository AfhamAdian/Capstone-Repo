-- Survey feature migration 003.
-- Adds data-driven question categories. Each custom category maps to one of
-- the five canonical score buckets so analysis remains comparable.

CREATE SEQUENCE IF NOT EXISTS surveycategory_id_seq;
CREATE TABLE IF NOT EXISTS public.surveycategory (
  id integer NOT NULL DEFAULT nextval('surveycategory_id_seq'::regclass),
  key character varying NOT NULL,
  label character varying NOT NULL,
  description text,
  rubric_category character varying NOT NULL,
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
