import { assertSupabaseClient } from '../config/supabase.js';
import type { SurveyCategoryScores } from '@libs/ai/index.js';

export interface SurveyInsightRow {
  survey_id: number;
  ai_insight: string | null;
  themes: string[] | null;
  delivery_score: number | null;
  code_quality_score: number | null;
  cicd_score: number | null;
  team_health_score: number | null;
  blockers_score: number | null;
  ai_model: string | null;
  generated_at: string | null;
}

export interface SaveInsightInput {
  surveyId: number;
  aiInsight: string;
  themes: string[];
  scores: SurveyCategoryScores;
  aiModel: string;
}

export async function saveInsight(input: SaveInsightInput): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client.from('surveyinsight').upsert(
    {
      survey_id: input.surveyId,
      ai_insight: input.aiInsight,
      themes: input.themes,
      delivery_score: input.scores.delivery,
      code_quality_score: input.scores.codeQuality,
      cicd_score: input.scores.cicd,
      team_health_score: input.scores.teamHealth,
      blockers_score: input.scores.blockers,
      ai_model: input.aiModel,
      generated_at: new Date().toISOString(),
    },
    { onConflict: 'survey_id' },
  );

  if (error) {
    throw new Error(`Failed to save survey insight for survey ${input.surveyId}: ${error.message}`);
  }
}

export async function getInsight(surveyId: number): Promise<SurveyInsightRow | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client.from('surveyinsight').select('*').eq('survey_id', surveyId).maybeSingle();
  if (error) {
    throw new Error(`Failed to load survey insight for survey ${surveyId}: ${error.message}`);
  }
  return (data as SurveyInsightRow) ?? null;
}

/** Most recently generated insight for a project's most recently completed survey - the 40%-sentiment side of the health blend. */
export async function getLatestInsightForProject(projectId: number): Promise<SurveyInsightRow | null> {
  const client = assertSupabaseClient();

  const { data: surveys, error: surveyError } = await client
    .from('survey')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1);
  if (surveyError) {
    throw new Error(`Failed to find latest completed survey for project ${projectId}: ${surveyError.message}`);
  }
  const latestSurveyId = surveys?.[0]?.id as number | undefined;
  if (!latestSurveyId) return null;

  return getInsight(latestSurveyId);
}
