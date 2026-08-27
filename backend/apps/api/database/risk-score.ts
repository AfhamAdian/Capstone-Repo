import { assertSupabaseClient } from '../config/supabase.js';
import type { RiskResult, RiskType } from '../../../libs/risk-engines/types.js';
import { RiskType as RiskTypeEnum } from '../../../libs/risk-engines/types.js';

/**
 * Save individual risk score to database linked with a project snapshot
 */
export async function saveRiskScore(result: RiskResult, projectSnapshotId: number): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client
    .from('riskscore')
    .insert([
      {
        project_snapshot_id: projectSnapshotId,
        security_score: result.type === RiskTypeEnum.SECURITY ? result.score : null,
        reliability_score: result.type === RiskTypeEnum.RELIABILITY ? result.score : null,
        maintainability_score: result.type === RiskTypeEnum.MAINTAINABILITY ? result.score : null,
        cicd_deployment_health_score: result.type === RiskTypeEnum.CICD_DEPLOYMENT_HEALTH ? result.score : null,
        team_health_score: result.type === RiskTypeEnum.TEAM_HEALTH ? result.score : null,
        engineering_process_score: result.type === RiskTypeEnum.ENGINEERING_PROCESS ? result.score : null,
        planning_execution_score: result.type === RiskTypeEnum.PLANNING_EXECUTION ? result.score : null,
      },
    ]);

  if (error) {
    throw new Error(`Failed to save risk score to database: ${error.message}`);
  }
}

/**
 * Save all risk scores at once (upsert) linked with a project snapshot.
 * `overallScore` is the single combined health score (see
 * apps/api/services/risk-calculation.service.ts for how it's derived) -
 * pass null when nothing could be computed (e.g. no tool had data yet).
 */
export async function saveAllRiskScores(
  projectSnapshotId: number,
  scores: Record<RiskType, number | null>,
  overallScore: number | null
): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client
    .from('riskscore')
    .insert([
      {
        project_snapshot_id: projectSnapshotId,
        security_score: scores[RiskTypeEnum.SECURITY] ?? null,
        reliability_score: scores[RiskTypeEnum.RELIABILITY] ?? null,
        maintainability_score: scores[RiskTypeEnum.MAINTAINABILITY] ?? null,
        cicd_deployment_health_score: scores[RiskTypeEnum.CICD_DEPLOYMENT_HEALTH] ?? null,
        team_health_score: scores[RiskTypeEnum.TEAM_HEALTH] ?? null,
        engineering_process_score: scores[RiskTypeEnum.ENGINEERING_PROCESS] ?? null,
        planning_execution_score: scores[RiskTypeEnum.PLANNING_EXECUTION] ?? null,
        overall_score: overallScore,
      },
    ]);

  if (error) {
    throw new Error(`Failed to save risk scores to database: ${error.message}`);
  }
}

export interface LatestRiskScoreRow {
  project_snapshot_id: number;
  security_score: number | null;
  reliability_score: number | null;
  maintainability_score: number | null;
  cicd_deployment_health_score: number | null;
  team_health_score: number | null;
  engineering_process_score: number | null;
  planning_execution_score: number | null;
  overall_score: number | null;
  created_at: string;
}

/** Latest risk score row for a project, via its most recent snapshot - the 60%-metrics side of the survey health blend. */
export async function getLatestRiskScoreForProject(projectId: number): Promise<LatestRiskScoreRow | null> {
  const client = assertSupabaseClient();

  const { data: snapshots, error: snapshotError } = await client
    .from('projectsnapshot')
    .select('id')
    .eq('project_id', projectId)
    .order('snapshot_time', { ascending: false })
    .limit(1);
  if (snapshotError) {
    throw new Error(`Failed to find latest snapshot for project ${projectId}: ${snapshotError.message}`);
  }
  const latestSnapshotId = snapshots?.[0]?.id as number | undefined;
  if (!latestSnapshotId) return null;

  const { data, error } = await client
    .from('riskscore')
    .select('*')
    .eq('project_snapshot_id', latestSnapshotId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load risk score for snapshot ${latestSnapshotId}: ${error.message}`);
  }
  return (data as LatestRiskScoreRow) ?? null;
}

export async function getRiskScoreBySnapshotId(snapshotId: number): Promise<LatestRiskScoreRow | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('riskscore')
    .select('*')
    .eq('project_snapshot_id', snapshotId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load risk score for snapshot ${snapshotId}: ${error.message}`);
  }
  return (data as LatestRiskScoreRow) ?? null;
}
