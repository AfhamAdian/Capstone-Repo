import { assertSupabaseClient } from '../config/supabase.js';

/**
 * Last-cycle delivery/CI facts used by survey-question generation and the
 * score-provenance inspector. Counts and rates only — never people or ticket ids.
 */
export interface IncidentSignals {
  snapshotId: number | null;
  snapshotTime: string | null;
  spilloverRatio: number | null;
  consecutiveSpilloverCount: number | null;
  blockedItemsCount: number | null;
  overdueItemsCount: number | null;
  scopeChurnRatio: number | null;
  midSprintAdditions: number | null;
  deploymentsPerWeek: number | null;
  deploymentFailureRatePercent: number | null;
  pipelineSuccessRatePercent: number | null;
  stalePrCount: number | null;
  prCycleTimeHours: number | null;
  commitsPerWeek: number | null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function loadSignalsForSnapshot(snapshotId: number, snapshotTime: string | null): Promise<IncidentSignals> {
  const client = assertSupabaseClient();
  const empty: IncidentSignals = {
    snapshotId,
    snapshotTime,
    spilloverRatio: null,
    consecutiveSpilloverCount: null,
    blockedItemsCount: null,
    overdueItemsCount: null,
    scopeChurnRatio: null,
    midSprintAdditions: null,
    deploymentsPerWeek: null,
    deploymentFailureRatePercent: null,
    pipelineSuccessRatePercent: null,
    stalePrCount: null,
    prCycleTimeHours: null,
    commitsPerWeek: null,
  };

  const [pm, vcs, cicd] = await Promise.all([
    client
      .from('projectmanagementmetrics')
      .select(
        'spillover_ratio, consecutive_spillover_count, blocked_items_count, overdue_items_count, scope_churn_ratio, mid_sprint_additions',
      )
      .eq('snapshot_id', snapshotId)
      .maybeSingle(),
    client
      .from('versioncontrolmetrics')
      .select('stale_pr_count, time_to_first_review_avg_hours, active_contributions_per_week')
      .eq('snapshot_id', snapshotId)
      .maybeSingle(),
    client
      .from('cicdmetrics')
      .select('deployments_per_week, deployment_failure_rate_percent, pipeline_success_rate_percent')
      .eq('snapshot_id', snapshotId)
      .maybeSingle(),
  ]);

  if (pm.error) throw new Error(`Failed to load project-management signals: ${pm.error.message}`);
  if (vcs.error) throw new Error(`Failed to load version-control signals: ${vcs.error.message}`);
  const cicdRow = cicd.error ? null : cicd.data;

  return {
    ...empty,
    spilloverRatio: asNumber(pm.data?.spillover_ratio),
    consecutiveSpilloverCount: asNumber(pm.data?.consecutive_spillover_count),
    blockedItemsCount: asNumber(pm.data?.blocked_items_count),
    overdueItemsCount: asNumber(pm.data?.overdue_items_count),
    scopeChurnRatio: asNumber(pm.data?.scope_churn_ratio),
    midSprintAdditions: asNumber(pm.data?.mid_sprint_additions),
    deploymentsPerWeek: asNumber(cicdRow?.deployments_per_week),
    deploymentFailureRatePercent: asNumber(cicdRow?.deployment_failure_rate_percent),
    pipelineSuccessRatePercent: asNumber(cicdRow?.pipeline_success_rate_percent),
    stalePrCount: asNumber(vcs.data?.stale_pr_count),
    prCycleTimeHours: asNumber(vcs.data?.time_to_first_review_avg_hours),
    commitsPerWeek: asNumber(vcs.data?.active_contributions_per_week),
  };
}

export async function getIncidentSignalsForSnapshot(snapshotId: number): Promise<IncidentSignals> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('projectsnapshot')
    .select('id, snapshot_time')
    .eq('id', snapshotId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load snapshot ${snapshotId}: ${error.message}`);
  return loadSignalsForSnapshot(snapshotId, (data?.snapshot_time as string | undefined) ?? null);
}

export async function getLatestIncidentSignals(projectId: number): Promise<IncidentSignals> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('projectsnapshot')
    .select('id, snapshot_time')
    .eq('project_id', projectId)
    .order('snapshot_time', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to find latest snapshot for project ${projectId}: ${error.message}`);
  if (!data) {
    return {
      snapshotId: null,
      snapshotTime: null,
      spilloverRatio: null,
      consecutiveSpilloverCount: null,
      blockedItemsCount: null,
      overdueItemsCount: null,
      scopeChurnRatio: null,
      midSprintAdditions: null,
      deploymentsPerWeek: null,
      deploymentFailureRatePercent: null,
      pipelineSuccessRatePercent: null,
      stalePrCount: null,
      prCycleTimeHours: null,
      commitsPerWeek: null,
    };
  }
  return loadSignalsForSnapshot(data.id as number, (data.snapshot_time as string | null) ?? null);
}

export function hasAnyIncidentSignal(signals: IncidentSignals): boolean {
  return [
    signals.spilloverRatio,
    signals.consecutiveSpilloverCount,
    signals.blockedItemsCount,
    signals.overdueItemsCount,
    signals.scopeChurnRatio,
    signals.midSprintAdditions,
    signals.deploymentsPerWeek,
    signals.deploymentFailureRatePercent,
    signals.pipelineSuccessRatePercent,
    signals.stalePrCount,
    signals.prCycleTimeHours,
    signals.commitsPerWeek,
  ].some((value) => value !== null);
}
