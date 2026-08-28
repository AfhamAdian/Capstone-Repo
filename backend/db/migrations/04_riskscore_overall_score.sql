-- Add a persisted overall-health-score column to riskscore. Previously the
-- "overall" score shown on the dashboard was only ever computed on read (a
-- plain average of whichever of the 7 subscores were present, in
-- apps/api/database/score.ts) and never stored. It's now calculated once,
-- alongside the 7 subscores, via the same null-aware renormalized-weighted
-- mechanism used everywhere else in risk-engines (equal weight per subscore,
-- so a snapshot missing some tools still gets a fair average over what it
-- does have) - see apps/api/services/risk-calculation.service.ts. Idempotent.

ALTER TABLE public.riskscore
  ADD COLUMN IF NOT EXISTS overall_score double precision;
