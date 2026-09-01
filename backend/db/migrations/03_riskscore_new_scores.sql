-- Replace the old 6 risk-score columns with the 7 new health-score columns
-- (backend/libs/risk-engines/scoring-rules/*.md). projecthealthscore is left
-- untouched - riskscore is now the single table scores are saved to and read
-- from. Old columns are dropped rather than renamed: even the ones with an
-- obvious old->new counterpart (e.g. delivery_score -> planning_execution_score)
-- held values computed by a retired, differently-directioned formula (old
-- scores were risk-oriented, lower-is-better; new scores are health-oriented,
-- higher-is-better), so carrying them forward under a new name would be
-- misleading rather than useful. Idempotent: safe to re-run on a
-- partially-migrated DB.

ALTER TABLE public.riskscore
  DROP COLUMN IF EXISTS cicd_reliability_score,
  DROP COLUMN IF EXISTS code_qaulity_score,
  DROP COLUMN IF EXISTS delivery_score,
  DROP COLUMN IF EXISTS security_risk_score,
  ADD COLUMN IF NOT EXISTS security_score double precision,
  ADD COLUMN IF NOT EXISTS reliability_score double precision,
  ADD COLUMN IF NOT EXISTS maintainability_score double precision,
  ADD COLUMN IF NOT EXISTS cicd_deployment_health_score double precision,
  ADD COLUMN IF NOT EXISTS planning_execution_score double precision;

-- engineering_process_score and team_health_score already exist with matching
-- names and are left as-is (their underlying formulas changed, but the score
-- identity/name didn't).
