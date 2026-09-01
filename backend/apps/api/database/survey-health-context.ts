import type { CategoryTrend, HealthTrendLabel, SurveyHealthContext } from '@libs/ai/index.js';
import { assertSupabaseClient } from '../config/supabase.js';
import { getLatestRiskScoreForProject, getRiskScoreBySnapshotId, type LatestRiskScoreRow } from './risk-score.js';

const STEADY_THRESHOLD = 3;
const SHARP_THRESHOLD = 15;

function classifyTrend(current: number | null, previous: number | null): CategoryTrend {
  if (current === null || previous === null) return { delta: null, label: 'unknown' };
  const delta = current - previous;
  const magnitude = Math.abs(delta);
  let label: HealthTrendLabel;
  if (magnitude < STEADY_THRESHOLD) label = 'steady';
  else if (magnitude >= SHARP_THRESHOLD) label = delta > 0 ? 'sharp_increase' : 'sharp_decrease';
  else label = delta > 0 ? 'gradual_increase' : 'gradual_decrease';
  return { delta, label };
}

/** The snapshot immediately before `latestSnapshotId`, if one exists. */
async function getPreviousSnapshotId(projectId: number, latestSnapshotId: number): Promise<number | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('projectsnapshot')
    .select('id')
    .eq('project_id', projectId)
    .order('snapshot_time', { ascending: false })
    .limit(2);
  if (error) {
    throw new Error(`Failed to find previous snapshot for project ${projectId}: ${error.message}`);
  }
  const ids = (data ?? []).map((row) => row.id as number);
  return ids.find((id) => id !== latestSnapshotId) ?? null;
}

function buildTrend(current: LatestRiskScoreRow, previous: LatestRiskScoreRow): SurveyHealthContext['trend'] {
  return {
    previousCapturedAt: previous.created_at,
    overall: classifyTrend(current.overall_score, previous.overall_score),
    security: classifyTrend(current.security_score, previous.security_score),
    reliability: classifyTrend(current.reliability_score, previous.reliability_score),
    maintainability: classifyTrend(current.maintainability_score, previous.maintainability_score),
    cicdDeploymentHealth: classifyTrend(current.cicd_deployment_health_score, previous.cicd_deployment_health_score),
    teamHealth: classifyTrend(current.team_health_score, previous.team_health_score),
    engineeringProcess: classifyTrend(current.engineering_process_score, previous.engineering_process_score),
    planningExecution: classifyTrend(current.planning_execution_score, previous.planning_execution_score),
  };
}

/** Captures the exact risk-engine snapshot (plus its trend vs the prior sync) supplied to Gemini for a survey. Sourced from riskscore only — never projecthealthscore. */
export async function captureSurveyHealthContext(projectId: number): Promise<SurveyHealthContext> {
  const riskScore = await getLatestRiskScoreForProject(projectId);

  if (!riskScore) {
    return {
      capturedAt: new Date().toISOString(),
      overallScore: null,
      scores: {
        security: null,
        reliability: null,
        maintainability: null,
        cicdDeploymentHealth: null,
        teamHealth: null,
        engineeringProcess: null,
        planningExecution: null,
      },
      metricsSnapshotId: null,
      source: 'unavailable',
    };
  }

  const previousSnapshotId = await getPreviousSnapshotId(projectId, riskScore.project_snapshot_id);
  const previousRiskScore = previousSnapshotId ? await getRiskScoreBySnapshotId(previousSnapshotId) : null;

  return {
    capturedAt: riskScore.created_at,
    overallScore: riskScore.overall_score,
    scores: {
      security: riskScore.security_score,
      reliability: riskScore.reliability_score,
      maintainability: riskScore.maintainability_score,
      cicdDeploymentHealth: riskScore.cicd_deployment_health_score,
      teamHealth: riskScore.team_health_score,
      engineeringProcess: riskScore.engineering_process_score,
      planningExecution: riskScore.planning_execution_score,
    },
    metricsSnapshotId: riskScore.project_snapshot_id,
    source: 'risk_score',
    trend: previousRiskScore ? buildTrend(riskScore, previousRiskScore) : undefined,
  };
}
