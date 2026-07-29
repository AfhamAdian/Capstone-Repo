/**
 * Survey link strategy switch.
 *
 * Two delivery models share the same token/bundle machinery:
 *  - 'shared'      : one anonymous link per survey cycle, reusable by the whole
 *                    cohort. Provably anonymous (the bundle carries no user_id),
 *                    but not single-use. This is the default.
 *  - 'single_use'  : one per-developer link, atomically consumed on first submit.
 *
 * Switching between them is a single env flag (SURVEY_LINK_MODE) — the rest of
 * the pipeline (token encode/decode, notifications, scoring) is identical. Keep
 * this the ONLY place that decides the mode so the switch stays a one-liner.
 */

export type SurveyLinkMode = 'shared' | 'single_use';

const DEFAULT_MODE: SurveyLinkMode = 'shared';

export function getSurveyLinkMode(): SurveyLinkMode {
  return process.env.SURVEY_LINK_MODE === 'single_use' ? 'single_use' : DEFAULT_MODE;
}

export function isSingleUse(mode: SurveyLinkMode): boolean {
  return mode === 'single_use';
}
