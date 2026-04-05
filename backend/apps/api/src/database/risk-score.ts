import { assertSupabaseClient } from '../config/supabase.js';
import type { RiskResult, RiskType } from '../../../../libs/risk-engines/types.js';
import { RiskType as RiskTypeEnum } from '../../../../libs/risk-engines/types.js';

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
      },
    ]);

  if (error) {
    throw new Error(`Failed to save risk scores to database: ${error.message}`);
  }
}
