import { assertSupabaseClient } from '../config/supabase.js';
import type { GeneratedSurveyQuestion } from '@libs/ai/index.js';

export type SurveyStatus = 'active' | 'sent' | 'completed';
export type SurveySource = 'manual' | 'auto_pulse';

export interface CreateSurveyInput {
  projectId: number;
  source: SurveySource;
  trigger: string;
  customGuidance?: string;
  periodMonth?: string; // 'YYYY-MM-01', only meaningful for auto_pulse
}

export interface SurveyRow {
  id: number;
  project_id: number;
  status: SurveyStatus;
  source: SurveySource;
  trigger: string;
  custom_guidance: string | null;
  target_count: number;
  response_count: number;
  sent_at: string;
  completed_at: string | null;
  period_month: string | null;
  first_sent_at: string | null;
  questions_modified_at: string | null;
}

export async function createSurvey(input: CreateSurveyInput): Promise<number> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('survey')
    .insert([
      {
        project_id: input.projectId,
        source: input.source,
        status: 'sent',
        trigger: input.trigger,
        custom_guidance: input.customGuidance ?? null,
        period_month: input.periodMonth ?? null,
      },
    ])
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create survey: ${error?.message ?? 'No survey row returned'}`);
  }

  return data.id as number;
}

/** Finds this month's auto-pulse survey for a project, creating it if it doesn't exist yet. */
export async function findOrCreateAutoPulseSurvey(projectId: number, periodMonth: string, trigger: string): Promise<number> {
  const client = assertSupabaseClient();

  const { data: existing, error: findError } = await client
    .from('survey')
    .select('id')
    .eq('project_id', projectId)
    .eq('source', 'auto_pulse')
    .eq('period_month', periodMonth)
    .maybeSingle();

  if (findError) {
    throw new Error(`Failed to look up auto-pulse survey: ${findError.message}`);
  }
  if (existing) {
    return existing.id as number;
  }

  return createSurvey({ projectId, source: 'auto_pulse', trigger, periodMonth });
}

export async function addSurveyQuestions(surveyId: number, questions: GeneratedSurveyQuestion[]): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client.from('surveyquestion').insert(
    questions.map((q, index) => ({
      survey_id: surveyId,
      category: q.category,
      question_text: q.questionText,
      question_type: q.questionType,
      order_index: index,
    })),
  );

  if (error) {
    throw new Error(`Failed to save survey questions: ${error.message}`);
  }
}

/** Used for full-replace edits (survey.service.ts::editQuestions) - safe pre-response since no surveyanswer rows reference these ids yet. */
export async function deleteQuestionsForSurvey(surveyId: number): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client.from('surveyquestion').delete().eq('survey_id', surveyId);
  if (error) {
    throw new Error(`Failed to delete questions for survey ${surveyId}: ${error.message}`);
  }
}

export async function markQuestionsModified(surveyId: number): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client.from('survey').update({ questions_modified_at: new Date().toISOString() }).eq('id', surveyId);
  if (error) {
    throw new Error(`Failed to mark survey ${surveyId} questions modified: ${error.message}`);
  }
}

/** Set once, the first time this survey is actually dispatched (manual or auto). No-op if already set. */
export async function markFirstSentAtIfAbsent(surveyId: number): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client
    .from('survey')
    .update({ first_sent_at: new Date().toISOString() })
    .eq('id', surveyId)
    .is('first_sent_at', null);
  if (error) {
    throw new Error(`Failed to mark survey ${surveyId} first sent: ${error.message}`);
  }
}

export interface SurveyQuestionRow {
  id: number;
  survey_id: number;
  category: string;
  question_text: string;
  question_type: 'text' | 'scale';
  order_index: number;
}

export async function getQuestionsForSurveys(surveyIds: number[]): Promise<SurveyQuestionRow[]> {
  if (surveyIds.length === 0) return [];
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('surveyquestion')
    .select('*')
    .in('survey_id', surveyIds)
    .order('order_index', { ascending: true });
  if (error) {
    throw new Error(`Failed to load questions for surveys [${surveyIds.join(',')}]: ${error.message}`);
  }
  return (data as SurveyQuestionRow[]) ?? [];
}

export async function getSurveyById(surveyId: number): Promise<SurveyRow | null> {
  const client = assertSupabaseClient();

  const { data, error } = await client.from('survey').select('*').eq('id', surveyId).maybeSingle();
  if (error) {
    throw new Error(`Failed to load survey ${surveyId}: ${error.message}`);
  }
  return (data as SurveyRow) ?? null;
}

export async function listSurveysForProject(projectId: number): Promise<SurveyRow[]> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('survey')
    .select('*')
    .eq('project_id', projectId)
    .order('sent_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list surveys for project ${projectId}: ${error.message}`);
  }
  return (data as SurveyRow[]) ?? [];
}

export interface ListSurveysGlobalFilters {
  projectId?: number;
  status?: SurveyStatus;
  search?: string;
}

export async function listSurveysGlobal(filters: ListSurveysGlobalFilters): Promise<SurveyRow[]> {
  const client = assertSupabaseClient();

  let query = client.from('survey').select('*').order('sent_at', { ascending: false });
  if (filters.projectId) query = query.eq('project_id', filters.projectId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.search) query = query.ilike('trigger', `%${filters.search}%`);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list surveys: ${error.message}`);
  }
  return (data as SurveyRow[]) ?? [];
}

export async function countManualSurveysThisMonth(projectId: number): Promise<number> {
  const client = assertSupabaseClient();

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const { count, error } = await client
    .from('survey')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('source', 'manual')
    .gte('sent_at', startOfMonth.toISOString());

  if (error) {
    throw new Error(`Failed to count manual surveys for project ${projectId}: ${error.message}`);
  }
  return count ?? 0;
}

export async function updateSurveyStatus(surveyId: number, status: SurveyStatus, completedAt?: Date): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client
    .from('survey')
    .update({ status, ...(completedAt ? { completed_at: completedAt.toISOString() } : {}) })
    .eq('id', surveyId);

  if (error) {
    throw new Error(`Failed to update survey ${surveyId} status: ${error.message}`);
  }
}

/**
 * Best-effort cached counter kept alongside the join-based derived count
 * (see getDerivedCounts, the actual source of truth read by the detail endpoint).
 * Read-then-write, not atomic - acceptable since this column is only a display
 * cache for list views, not used for any completion/threshold decision.
 */
export async function incrementSurveyTargetCount(surveyId: number, by: number): Promise<void> {
  const client = assertSupabaseClient();
  const survey = await getSurveyById(surveyId);
  if (!survey) throw new Error(`Cannot increment target_count: survey ${surveyId} not found`);

  const { error } = await client
    .from('survey')
    .update({ target_count: survey.target_count + by })
    .eq('id', surveyId);
  if (error) {
    throw new Error(`Failed to increment survey ${surveyId} target_count: ${error.message}`);
  }
}

/**
 * Source-of-truth per-project target/response counts, computed via the
 * bundle/response join since one response can span multiple projects'
 * surveys (see backend/db/migrations/002_survey.sql).
 */
export async function getDerivedCounts(surveyId: number): Promise<{ targetCount: number; responseCount: number }> {
  const client = assertSupabaseClient();

  const { count: targetCount, error: targetError } = await client
    .from('surveybundlesurvey')
    .select('id', { count: 'exact', head: true })
    .eq('survey_id', surveyId);
  if (targetError) {
    throw new Error(`Failed to compute target count for survey ${surveyId}: ${targetError.message}`);
  }

  const { data: questionRows, error: questionError } = await client
    .from('surveyquestion')
    .select('id')
    .eq('survey_id', surveyId);
  if (questionError) {
    throw new Error(`Failed to load questions for survey ${surveyId}: ${questionError.message}`);
  }
  const questionIds = (questionRows ?? []).map((q) => q.id as number);
  if (questionIds.length === 0) {
    return { targetCount: targetCount ?? 0, responseCount: 0 };
  }

  const { data: answerRows, error: answerError } = await client
    .from('surveyanswer')
    .select('response_id')
    .in('question_id', questionIds);
  if (answerError) {
    throw new Error(`Failed to compute response count for survey ${surveyId}: ${answerError.message}`);
  }
  const distinctResponseIds = new Set((answerRows ?? []).map((a) => a.response_id as number));

  return { targetCount: targetCount ?? 0, responseCount: distinctResponseIds.size };
}

export interface RawResponseGroup {
  question: string;
  category: string;
  answers: string[];
}

/** Groups answers by question, matching the frontend's `Survey.rawResponses` shape. */
export async function getRawResponsesForSurvey(surveyId: number): Promise<RawResponseGroup[]> {
  const client = assertSupabaseClient();

  const { data: questions, error: questionError } = await client
    .from('surveyquestion')
    .select('id, question_text, category, order_index')
    .eq('survey_id', surveyId)
    .order('order_index', { ascending: true });
  if (questionError) {
    throw new Error(`Failed to load questions for survey ${surveyId}: ${questionError.message}`);
  }
  if (!questions || questions.length === 0) return [];

  const questionIds = questions.map((q) => q.id as number);
  const { data: answers, error: answerError } = await client
    .from('surveyanswer')
    .select('question_id, answer_text, answer_scale')
    .in('question_id', questionIds);
  if (answerError) {
    throw new Error(`Failed to load answers for survey ${surveyId}: ${answerError.message}`);
  }

  return questions.map((q) => ({
    question: q.question_text as string,
    category: q.category as string,
    answers: (answers ?? [])
      .filter((a) => a.question_id === q.id)
      .map((a) => (a.answer_text ?? String(a.answer_scale ?? ''))),
  }));
}
