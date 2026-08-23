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
import { blendCategory, blendOverall } from './health-score-weights.js';

const log = logger.child({ component: 'health-score-blend-service' });

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

    const deliveryScore = blendCategory(riskScore?.delivery_score ?? null, insight?.scores?.delivery ?? null);
    const codeQualityScore = blendCategory(riskScore?.code_qaulity_score ?? null, insight?.scores?.codeQuality ?? null);
    const cicdScore = blendCategory(riskScore?.cicd_reliability_score ?? null, insight?.scores?.cicd ?? null);
    const teamHealthScore = blendCategory(riskScore?.team_health_score ?? null, insight?.scores?.teamHealth ?? null);
    const blockersScore = blendCategory(riskScore?.blockers_score ?? null, insight?.scores?.blockers ?? null);

    const overallScore = blendOverall({
      delivery: deliveryScore,
      codeQuality: codeQualityScore,
      cicd: cicdScore,
      teamHealth: teamHealthScore,
      blockers: blockersScore,
    });

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
