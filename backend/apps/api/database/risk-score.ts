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
        cicd_reliability_score: result.type === RiskTypeEnum.CICD_RELIABILITY ? result.score : null,
        code_qaulity_score: result.type === RiskTypeEnum.CODE_QUALITY ? result.score : null,
        delivery_score: result.type === RiskTypeEnum.DELIVERY ? result.score : null,
        engineering_process_score: result.type === RiskTypeEnum.ENGINEERING_PROCESS ? result.score : null,
        security_risk_score: result.type === RiskTypeEnum.SECURITY_RISK ? result.score : null,
        team_health_score: result.type === RiskTypeEnum.TEAM_HEALTH ? result.score : null,
        blockers_score: result.type === RiskTypeEnum.BLOCKERS ? result.score : null,
      },
    ]);

  if (error) {
    throw new Error(`Failed to save risk score to database: ${error.message}`);
  }
}

/**
 * Save all risk scores at once (upsert) linked with a project snapshot
 */
export async function saveAllRiskScores(
  projectSnapshotId: number,
  scores: Record<RiskType, number | null>
): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client
    .from('riskscore')
    .insert([
      {
        project_snapshot_id: projectSnapshotId,
        cicd_reliability_score: scores[RiskTypeEnum.CICD_RELIABILITY] ?? null,
        code_qaulity_score: scores[RiskTypeEnum.CODE_QUALITY] ?? null,
        delivery_score: scores[RiskTypeEnum.DELIVERY] ?? null,
        engineering_process_score: scores[RiskTypeEnum.ENGINEERING_PROCESS] ?? null,
        security_risk_score: scores[RiskTypeEnum.SECURITY_RISK] ?? null,
        team_health_score: scores[RiskTypeEnum.TEAM_HEALTH] ?? null,
        blockers_score: scores[RiskTypeEnum.BLOCKERS] ?? null,
      },
    ]);

  if (error) {
    throw new Error(`Failed to save risk scores to database: ${error.message}`);
  }
}

export interface LatestRiskScoreRow {
  project_snapshot_id: number;
  cicd_reliability_score: number | null;
  code_qaulity_score: number | null;
  delivery_score: number | null;
  engineering_process_score: number | null;
  security_risk_score: number | null;
  team_health_score: number | null;
  blockers_score: number | null;
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
