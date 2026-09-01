/**
 * Raw ops-metric history for the dashboard cards (commits, tickets, velocity,
 * blockers, deployments, PR cycle time). Each sync writes a projectsnapshot
 * plus one or more of versioncontrolmetrics / projectmanagementmetrics /
 * cicdmetrics. GitHub and Jira often share one snapshot; older runs may have
 * one snapshot per tool, so readers carry the last known value forward.
 */

import { assertSupabaseClient } from '../config/supabase.js';

export interface SnapshotOpsMetricsRow {
  snapshotId: number;
  snapshotTime: string;
  commits: number | null;
  ticketsClosed: number | null;
  sprintVelocity: number | null;
  openBlockers: number | null;
  deployments: number | null;
  prCycleTime: number | null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Every tool metrics table stores its data as one `metrics` jsonb column now
 * (the connector's own camelCase output, verbatim) rather than per-metric
 * columns - see db/schema/*.sql. Returns snapshot_id -> parsed metrics object.
 */
async function selectMetricsBySnapshotIds(
  table: string,
  snapshotIds: number[],
): Promise<Map<number, Record<string, unknown>>> {
  const result = new Map<number, Record<string, unknown>>();
  if (snapshotIds.length === 0) return result;
  const client = assertSupabaseClient();
  const { data, error } = await client.from(table).select('snapshot_id, metrics').in('snapshot_id', snapshotIds);
  if (error) {
    throw new Error(`Failed to load ${table}: ${error.message}`);
  }
  for (const row of (data ?? []) as { snapshot_id: number; metrics: Record<string, unknown> | null }[]) {
    result.set(row.snapshot_id, row.metrics ?? {});
  }
  return result;
}

export async function listProjectOpsMetricsHistory(
  projectId: number,
  limit = 60,
): Promise<SnapshotOpsMetricsRow[]> {
  const client = assertSupabaseClient();

  const { data: snapshots, error: snapshotError } = await client
    .from('projectsnapshot')
    .select('id, snapshot_time')
    .eq('project_id', projectId)
    .order('snapshot_time', { ascending: false })
    .limit(limit);

  if (snapshotError) {
    throw new Error(`Failed to load snapshots for project ${projectId}: ${snapshotError.message}`);
  }

  const ordered = ((snapshots ?? []) as { id: number; snapshot_time: string }[]).reverse();
  if (ordered.length === 0) return [];

  const snapshotIds = ordered.map((row) => row.id);

  const [vcsBySnapshot, pmBySnapshot, cicdBySnapshot] = await Promise.all([
    selectMetricsBySnapshotIds('versioncontrolmetrics', snapshotIds),
    selectMetricsBySnapshotIds('projectmanagementmetrics', snapshotIds),
    selectMetricsBySnapshotIds('cicdmetrics', snapshotIds).catch(() => new Map<number, Record<string, unknown>>()),
  ]);

  return ordered.map((snapshot) => {
    const vcs = vcsBySnapshot.get(snapshot.id);
    const pm = pmBySnapshot.get(snapshot.id);
    const cicd = cicdBySnapshot.get(snapshot.id);
    return {
      snapshotId: snapshot.id,
      snapshotTime: snapshot.snapshot_time,
      commits: asNumber(vcs?.activeContributionsPerWeek),
      ticketsClosed: asNumber(vcs?.issuesClosedPerWeek),
      sprintVelocity: asNumber(pm?.throughputPerWeek),
      openBlockers: asNumber(pm?.blockedItemsCount),
      deployments: asNumber(cicd?.deploymentsPerWeek),
      prCycleTime: asNumber(vcs?.timeToFirstReviewAvgHours),
    };
  });
}
