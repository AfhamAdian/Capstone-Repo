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

  // Every tool metrics table stores its data as one `metrics` jsonb column
  // (the connector's own camelCase output, verbatim) rather than per-metric
  // columns - see db/schema/*.sql. Named columns were dropped by migration
  // 02_metrics_tables_to_jsonb.sql, so we read the same values back out of
  // the jsonb blob instead.
  const [pm, vcs, cicd] = await Promise.all([
    client.from('projectmanagementmetrics').select('metrics').eq('snapshot_id', snapshotId).maybeSingle(),
    client.from('versioncontrolmetrics').select('metrics').eq('snapshot_id', snapshotId).maybeSingle(),
    client.from('cicdmetrics').select('metrics').eq('snapshot_id', snapshotId).maybeSingle(),
  ]);

  if (pm.error) throw new Error(`Failed to load project-management signals: ${pm.error.message}`);
  if (vcs.error) throw new Error(`Failed to load version-control signals: ${vcs.error.message}`);

  const pmMetrics = (pm.data?.metrics ?? {}) as Record<string, unknown>;
  const vcsMetrics = (vcs.data?.metrics ?? {}) as Record<string, unknown>;
  const cicdMetrics = (cicd.error ? {} : cicd.data?.metrics ?? {}) as Record<string, unknown>;
  const spillover = (pmMetrics.spillover ?? {}) as Record<string, unknown>;
  const scopeChurn = (pmMetrics.scopeChurn ?? {}) as Record<string, unknown>;

  return {
    ...empty,
    spilloverRatio: asNumber(spillover.spilloverRatio),
    consecutiveSpilloverCount: asNumber(spillover.consecutiveSpilloverCount),
    blockedItemsCount: asNumber(pmMetrics.blockedItemsCount),
    overdueItemsCount: asNumber(pmMetrics.overdueItemsCount),
    scopeChurnRatio: asNumber(pmMetrics.scopeCreepRate),
    midSprintAdditions: asNumber(scopeChurn.midSprintAdditions),
    deploymentsPerWeek: asNumber(cicdMetrics.deploymentsPerWeek),
    deploymentFailureRatePercent: asNumber(cicdMetrics.deploymentFailureRatePercent),
    pipelineSuccessRatePercent: asNumber(cicdMetrics.pipelineSuccessRatePercent),
    stalePrCount: asNumber(vcsMetrics.stalePrCount),
    prCycleTimeHours: asNumber(vcsMetrics.timeToFirstReviewAvgHours),
    commitsPerWeek: asNumber(vcsMetrics.activeContributionsPerWeek),
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
