/**
 * Health Score Blend Service
 * Combines the 60%-metrics side (riskscore, existing Sync feature, unchanged)
 * with the 40%-sentiment side (surveyinsight, new Survey feature) into the
 * frontend-facing projecthealthscore. Kept as a separate post-processing step
 * rather than embedded in risk-calculation.service.ts so the Sync feature has
 * no dependency on surveys ever existing.
 */

import { logger } from '@libs/logger.js';
import { getLatestRiskScoreForProject } from '../database/risk-score.js';
import { getLatestInsightForProject } from '../database/survey-insight.js';
import { saveProjectHealthScore } from '../database/project-health-score.js';

const log = logger.child({ component: 'health-score-blend-service' });

const METRICS_WEIGHT = 0.6;
const SURVEY_WEIGHT = 0.4;

// Rubric footer weights (App.tsx:1839-1841)
const CATEGORY_WEIGHTS = {
  delivery: 0.25,
  codeQuality: 0.2,
  cicd: 0.2,
  teamHealth: 0.2,
  blockers: 0.15,
} as const;

function blend(metricsScore: number | null, surveyScore: number | null): number | null {
  if (metricsScore === null && surveyScore === null) return null;
  if (surveyScore === null) return metricsScore; // no completed survey yet - metrics only
  if (metricsScore === null) return surveyScore;
  return metricsScore * METRICS_WEIGHT + surveyScore * SURVEY_WEIGHT;
}

export async function blendAndSaveProjectHealthScore(projectId: number): Promise<void> {
  try {
    const [riskScore, insight] = await Promise.all([
      getLatestRiskScoreForProject(projectId),
      getLatestInsightForProject(projectId),
    ]);

    const deliveryScore = blend(riskScore?.delivery_score ?? null, insight?.delivery_score ?? null);
    const codeQualityScore = blend(riskScore?.code_qaulity_score ?? null, insight?.code_quality_score ?? null);
    const cicdScore = blend(riskScore?.cicd_reliability_score ?? null, insight?.cicd_score ?? null);
    const teamHealthScore = blend(riskScore?.team_health_score ?? null, insight?.team_health_score ?? null);
    const blockersScore = blend(riskScore?.blockers_score ?? null, insight?.blockers_score ?? null);

    const weighted = [
      [deliveryScore, CATEGORY_WEIGHTS.delivery],
      [codeQualityScore, CATEGORY_WEIGHTS.codeQuality],
      [cicdScore, CATEGORY_WEIGHTS.cicd],
      [teamHealthScore, CATEGORY_WEIGHTS.teamHealth],
      [blockersScore, CATEGORY_WEIGHTS.blockers],
    ] as const;

    const presentWeight = weighted.filter(([score]) => score !== null).reduce((sum, [, w]) => sum + w, 0);
    const overallScore =
      presentWeight > 0
        ? weighted.reduce((sum, [score, w]) => sum + (score ?? 0) * w, 0) / presentWeight
        : null;

    await saveProjectHealthScore({
      projectId,
      projectSnapshotId: riskScore?.project_snapshot_id ?? null,
      surveyId: null, // set by the caller-specific insight processor when blending off a specific survey; not tracked here since this reads "latest" of each side independently
      deliveryScore,
      codeQualityScore,
      cicdScore,
      teamHealthScore,
      blockersScore,
      overallScore,
    });
  } catch (error) {
    log.error({ error, projectId }, 'failed to blend and save project health score');
    // Non-fatal by design - callers (sync-processor, survey-insight-processor) treat this as supplementary.
  }
}
