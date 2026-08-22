// Reads a project's latest risk score (project -> newest projectsnapshot with a riskscore -> riskscore).

import { assertSupabaseClient } from '../config/supabase.js';

export interface ProjectRiskScore {
  snapshotId: number;
  snapshotTime: string | null;
  // Average of the available sub-scores (risk: higher = worse). Null when nothing was computed.
  overallRisk: number | null;
  subscores: {
    delivery: number | null;
    codeQuality: number | null;
    cicd: number | null;
    engineeringProcess: number | null;
    teamHealth: number | null;
    security: number | null;
    blockers: number | null;
  };
}

// riskscore row -> API shape (note the DB column `code_qaulity_score` is misspelled).
function toScore(snapshotId: number, snapshotTime: string | null, row: Record<string, unknown>): ProjectRiskScore {
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  const subscores = {
    delivery: num(row.delivery_score),
    codeQuality: num(row.code_qaulity_score),
    cicd: num(row.cicd_reliability_score),
    engineeringProcess: num(row.engineering_process_score),
    teamHealth: num(row.team_health_score),
    security: num(row.security_risk_score),
    blockers: num(row.blockers_score),
  };
  const present = Object.values(subscores).filter((v): v is number => v !== null);
  const overallRisk = present.length
    ? Math.round(present.reduce((a, b) => a + b, 0) / present.length)
    : null;
  return { snapshotId, snapshotTime, overallRisk, subscores };
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
