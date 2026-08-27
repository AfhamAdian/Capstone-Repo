// Reads a project's risk score(s) (project -> projectsnapshot(s) with a riskscore -> riskscore).
// riskscore holds the 7 new health scores (higher = better) - see
// backend/libs/risk-engines/scoring-rules/*.md and risk-engines-reference.md.

import { assertSupabaseClient } from '../config/supabase.js';

export interface ProjectRiskSubscores {
  security: number | null;
  reliability: number | null;
  maintainability: number | null;
  cicdDeploymentHealth: number | null;
  teamHealth: number | null;
  engineeringProcess: number | null;
  planningExecution: number | null;
}

export interface ProjectRiskScore {
  snapshotId: number;
  snapshotTime: string | null;
  // Average of the available sub-scores (health: higher = better). Null when nothing was computed.
  overall: number | null;
  subscores: ProjectRiskSubscores;
}

// riskscore row -> API shape.
function toScore(snapshotId: number, snapshotTime: string | null, row: Record<string, unknown>): ProjectRiskScore {
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  const subscores: ProjectRiskSubscores = {
    security: num(row.security_score),
    reliability: num(row.reliability_score),
    maintainability: num(row.maintainability_score),
    cicdDeploymentHealth: num(row.cicd_deployment_health_score),
    teamHealth: num(row.team_health_score),
    engineeringProcess: num(row.engineering_process_score),
    planningExecution: num(row.planning_execution_score),
  };
  const present = Object.values(subscores).filter((v): v is number => v !== null);
  const overall = present.length ? Math.round(present.reduce((a, b) => a + b, 0) / present.length) : null;
  return { snapshotId, snapshotTime, overall, subscores };
}

// Latest score per project — keyed by projectId. Uses the newest snapshot that actually has a riskscore.
export async function getLatestScoresForProjects(
  projectIds: number[],
): Promise<Map<number, ProjectRiskScore>> {
  const result = new Map<number, ProjectRiskScore>();
  if (projectIds.length === 0) {
    return result;
  }
  const client = assertSupabaseClient();

  const { data: snaps, error: snapErr } = await client
    .from('projectsnapshot')
    .select('id, project_id, snapshot_time')
    .in('project_id', projectIds);
  if (snapErr) {
    throw new Error(`Failed to load project snapshots: ${snapErr.message}`);
  }

  const snapById = new Map<number, { projectId: number; time: string | null }>();
  for (const s of snaps ?? []) {
    snapById.set(s.id as number, { projectId: s.project_id as number, time: s.snapshot_time as string | null });
  }
  if (snapById.size === 0) {
    return result;
  }

  const { data: risks, error: riskErr } = await client
    .from('riskscore')
    .select('*')
    .in('project_snapshot_id', [...snapById.keys()]);
  if (riskErr) {
    throw new Error(`Failed to load risk scores: ${riskErr.message}`);
  }

  // Per project, keep the riskscore whose snapshot id is highest (newest).
  const best = new Map<number, { snapId: number; time: string | null; row: Record<string, unknown> }>();
  for (const r of risks ?? []) {
    const snapId = r.project_snapshot_id as number;
    const snap = snapById.get(snapId);
    if (!snap) continue;
    const current = best.get(snap.projectId);
    if (!current || snapId > current.snapId) {
      best.set(snap.projectId, { snapId, time: snap.time, row: r as Record<string, unknown> });
    }
  }

  for (const [projectId, b] of best) {
    result.set(projectId, toScore(b.snapId, b.time, b.row));
  }
  return result;
}

export async function getLatestScoreForProject(projectId: number): Promise<ProjectRiskScore | null> {
  const map = await getLatestScoresForProjects([projectId]);
  return map.get(projectId) ?? null;
}

/**
 * Chronological history (oldest first) of a project's risk scores, one entry
 * per synced snapshot that has a riskscore row - used for the dashboard's
 * sparkline/timeSeries/subscoreSeries. riskscore has no project_id of its own
 * (only project_snapshot_id), so this goes through projectsnapshot first, same
 * two-step pattern as getLatestScoresForProjects.
 */
export async function listScoreHistoryForProject(projectId: number, limit = 60): Promise<ProjectRiskScore[]> {
  const client = assertSupabaseClient();

  const { data: snaps, error: snapErr } = await client
    .from('projectsnapshot')
    .select('id, snapshot_time')
    .eq('project_id', projectId)
    .order('snapshot_time', { ascending: true })
    .limit(limit);
  if (snapErr) {
    throw new Error(`Failed to load project snapshots for project ${projectId}: ${snapErr.message}`);
  }
  if (!snaps || snaps.length === 0) {
    return [];
  }

  const snapIds = snaps.map((s) => s.id as number);
  const { data: risks, error: riskErr } = await client
    .from('riskscore')
    .select('*')
    .in('project_snapshot_id', snapIds);
  if (riskErr) {
    throw new Error(`Failed to load risk score history for project ${projectId}: ${riskErr.message}`);
  }

  const riskBySnapId = new Map<number, Record<string, unknown>>();
  for (const r of risks ?? []) {
    riskBySnapId.set(r.project_snapshot_id as number, r as Record<string, unknown>);
  }

  return snaps
    .filter((s) => riskBySnapId.has(s.id as number))
    .map((s) => toScore(s.id as number, s.snapshot_time as string | null, riskBySnapId.get(s.id as number)!));
}
