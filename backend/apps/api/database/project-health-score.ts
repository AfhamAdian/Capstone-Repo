import { assertSupabaseClient } from '../config/supabase.js';

export interface SaveProjectHealthScoreInput {
  projectId: number;
  projectSnapshotId: number | null;
  surveyId: number | null;
  deliveryScore: number | null;
  codeQualityScore: number | null;
  cicdScore: number | null;
  teamHealthScore: number | null;
  blockersScore: number | null;
  overallScore: number | null;
}

export async function saveProjectHealthScore(input: SaveProjectHealthScoreInput): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client.from('projecthealthscore').insert([
    {
      project_id: input.projectId,
      project_snapshot_id: input.projectSnapshotId,
      survey_id: input.surveyId,
      delivery_score: input.deliveryScore,
      code_quality_score: input.codeQualityScore,
      cicd_score: input.cicdScore,
      team_health_score: input.teamHealthScore,
      blockers_score: input.blockersScore,
      overall_score: input.overallScore,
    },
  ]);

  if (error) {
    throw new Error(`Failed to save project health score for project ${input.projectId}: ${error.message}`);
  }
}

export interface ProjectHealthScoreRow {
  id: number;
  project_id: number;
  project_snapshot_id: number | null;
  survey_id: number | null;
  delivery_score: number | null;
  code_quality_score: number | null;
  cicd_score: number | null;
  team_health_score: number | null;
  blockers_score: number | null;
  overall_score: number | null;
  computed_at: string;
}

export async function getLatestProjectHealthScore(projectId: number): Promise<ProjectHealthScoreRow | null> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('projecthealthscore')
    .select('*')
    .eq('project_id', projectId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load latest health score for project ${projectId}: ${error.message}`);
  }
  return (data as ProjectHealthScoreRow) ?? null;
}

/**
 * Chronological history (oldest first) for charting - a row is inserted here
 * after every sync (blendAndSaveProjectHealthScore), so this doubles as both
 * the sparkline/timeSeries and the per-category subscoreSeries source for the
 * frontend dashboard, with no separate snapshot query needed.
 */
export async function listProjectHealthScoreHistory(projectId: number, limit = 60): Promise<ProjectHealthScoreRow[]> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('projecthealthscore')
    .select('*')
    .eq('project_id', projectId)
    .order('computed_at', { ascending: false })
    .limit(limit);

  if (error) {
  }
  return ((data as ProjectHealthScoreRow[]) ?? []).reverse();
}
