/**
 * Survey Trigger Service
 * Watches sync-derived risk scores and flags a project as due for a survey
 * (Project.pendingSurvey in the frontend) when specific thresholds are crossed.
 */

import { RiskType } from '@libs/risk-engines/types.js';
import { logger } from '@libs/logger.js';
import { setPendingSurvey } from '../database/project.js';

const log = logger.child({ component: 'survey-trigger-service' });

const BLOCKERS_THRESHOLD = 50;
const TEAM_HEALTH_THRESHOLD = 40;
const DELIVERY_THRESHOLD = 40;

export async function evaluateSurveyTrigger(projectId: number, riskScores: Record<string, number | null>): Promise<void> {
  const blockers = riskScores[RiskType.BLOCKERS];
  const teamHealth = riskScores[RiskType.TEAM_HEALTH];
  const delivery = riskScores[RiskType.DELIVERY];

  let trigger: string | null = null;
  if (typeof blockers === 'number' && blockers < BLOCKERS_THRESHOLD) {
    trigger = 'Open blockers exceeded threshold';
  } else if (typeof teamHealth === 'number' && teamHealth < TEAM_HEALTH_THRESHOLD) {
    trigger = 'Team health score dropped';
  } else if (typeof delivery === 'number' && delivery < DELIVERY_THRESHOLD) {
    trigger = 'Delivery score dropped';
  }

  try {
    await setPendingSurvey(projectId, trigger !== null, trigger ?? undefined);
    if (trigger) {
      log.info({ projectId, trigger }, 'project flagged as due for a survey');
    }
  } catch (error) {
    log.error({ error, projectId }, 'failed to update pending_survey flag');
    // Non-fatal - this is a supplementary UI hint, not part of the sync pipeline's correctness.
  }
}
