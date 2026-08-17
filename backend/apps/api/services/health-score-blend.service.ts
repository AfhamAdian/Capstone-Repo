/**
 * Health Score Blend Service
 * Combines the 60%-metrics side (riskscore, existing Sync feature, unchanged)
 * with the 40%-sentiment side (survey.insight) into the frontend-facing
 * projecthealthscore. Kept as a separate post-processing step rather than
 * embedded in risk-calculation.service.ts so the Sync feature has no
 * dependency on surveys ever existing.
 */

import { logger } from '@libs/logger.js';
import { getLatestRiskScoreForProject } from '../database/risk-score.js';
import { getLatestInsightForProject, getSurveyById } from '../database/survey.js';
import { saveProjectHealthScore } from '../database/project-health-score.js';

const log = logger.child({ component: 'health-score-blend-service' });

const METRICS_WEIGHT = 0.6;
const SURVEY_WEIGHT = 0.4;

const CATEGORY_WEIGHTS = {
  delivery: 0.25,
  codeQuality: 0.2,
  cicd: 0.2,
  teamHealth: 0.2,
  blockers: 0.15,
} as const;

function blend(metricsScore: number | null, surveyScore: number | null): number | null {
  if (metricsScore === null && surveyScore === null) return null;
  if (surveyScore === null) return metricsScore;
  if (metricsScore === null) return surveyScore;
  return metricsScore * METRICS_WEIGHT + surveyScore * SURVEY_WEIGHT;
}

export async function blendAndSaveProjectHealthScore(projectId: number, surveyId: number | null = null): Promise<void> {
  try {
    const [riskScore, insightRecord] = await Promise.all([
      getLatestRiskScoreForProject(projectId),
      surveyId === null
        ? getLatestInsightForProject(projectId)
        : getSurveyById(surveyId).then((survey) => (
          survey?.insight ? { surveyId: survey.id, insight: survey.insight } : null
        )),
    ]);
    const insight = insightRecord?.insight ?? null;

    const deliveryScore = blend(riskScore?.delivery_score ?? null, insight?.scores?.delivery ?? null);
    const codeQualityScore = blend(riskScore?.code_qaulity_score ?? null, insight?.scores?.codeQuality ?? null);
    const cicdScore = blend(riskScore?.cicd_reliability_score ?? null, insight?.scores?.cicd ?? null);
    const teamHealthScore = blend(riskScore?.team_health_score ?? null, insight?.scores?.teamHealth ?? null);
    const blockersScore = blend(riskScore?.blockers_score ?? null, insight?.scores?.blockers ?? null);

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
      surveyId: insightRecord?.surveyId ?? null,
      deliveryScore,
      codeQualityScore,
      cicdScore,
      teamHealthScore,
      blockersScore,
      overallScore,
    });
  } catch (error) {
    log.error({ error, projectId }, 'failed to blend and save project health score');
  }
}
