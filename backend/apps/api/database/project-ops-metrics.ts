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

async function selectBySnapshotIds<T extends Record<string, unknown>>(
  table: string,
  snapshotIds: number[],
  columns: string,
): Promise<T[]> {
  if (snapshotIds.length === 0) return [];
  const client = assertSupabaseClient();
  const { data, error } = await client.from(table).select(columns).in('snapshot_id', snapshotIds);
  if (error) {
    throw new Error(`Failed to load ${table}: ${error.message}`);
  }
  return (data ?? []) as T[];
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

  const [vcsRows, pmRows, cicdRows] = await Promise.all([
    selectBySnapshotIds<{
      snapshot_id: number;
      active_contributions_per_week: unknown;
      issues_closed_per_week: unknown;
      time_to_first_review_avg_hours: unknown;
    }>('versioncontrolmetrics', snapshotIds, 'snapshot_id, active_contributions_per_week, issues_closed_per_week, time_to_first_review_avg_hours'),
    selectBySnapshotIds<{
      snapshot_id: number;
      throughput_per_week: unknown;
      blocked_items_count: unknown;
    }>('projectmanagementmetrics', snapshotIds, 'snapshot_id, throughput_per_week, blocked_items_count'),
    selectBySnapshotIds<{
      snapshot_id: number;
      deployments_per_week: unknown;
    }>('cicdmetrics', snapshotIds, 'snapshot_id, deployments_per_week').catch(() => []),
  ]);

  const vcsBySnapshot = new Map(vcsRows.map((row) => [row.snapshot_id, row]));
  const pmBySnapshot = new Map(pmRows.map((row) => [row.snapshot_id, row]));
  const cicdBySnapshot = new Map(cicdRows.map((row) => [row.snapshot_id, row]));

  return ordered.map((snapshot) => {
    const vcs = vcsBySnapshot.get(snapshot.id);
    const pm = pmBySnapshot.get(snapshot.id);
    const cicd = cicdBySnapshot.get(snapshot.id);
    return {
      snapshotId: snapshot.id,
      snapshotTime: snapshot.snapshot_time,
      commits: asNumber(vcs?.active_contributions_per_week),
      ticketsClosed: asNumber(vcs?.issues_closed_per_week),
      sprintVelocity: asNumber(pm?.throughput_per_week),
      openBlockers: asNumber(pm?.blocked_items_count),
      deployments: asNumber(cicd?.deployments_per_week),
      prCycleTime: asNumber(vcs?.time_to_first_review_avg_hours),
    };
  });
}
