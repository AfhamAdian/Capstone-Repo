import { assertSupabaseClient } from '../config/supabase.js';
import type { GeneratedSurveyQuestion, SurveyHealthContext } from '@libs/ai/index.js';

export type SurveyStatus =
  | 'draft'
  | 'in_review'
  | 'scheduled'
  | 'sending'
  | 'active'
  | 'paused'
  | 'closed'
  | 'analyzing'
  | 'completed'
  | 'cancelled'
  | 'failed';
export type SurveySource = 'manual' | 'auto_pulse';

export interface CreateSurveyInput {
  projectId: number;
  source: SurveySource;
  trigger: string;
  customGuidance?: string;
  periodMonth?: string; // 'YYYY-MM-01', only meaningful for auto_pulse
  status?: SurveyStatus;
  reviewDeadlineAt?: Date;
  scheduledSendAt?: Date;
  healthContext?: SurveyHealthContext;
}

export interface SurveyRow {
  id: number;
  project_id: number;
  status: SurveyStatus;
  source: SurveySource;
  trigger: string;
  custom_guidance: string | null;
  target_count: number;
  sent_at: string | null;
  completed_at: string | null;
  period_month: string | null;
  review_deadline_at: string | null;
  scheduled_send_at: string | null;
  closed_at: string | null;
  close_reason: string | null;
  health_context_snapshot: SurveyHealthContext | null;
  question_version: number;
  analysis_error: string | null;
}

export async function createSurvey(input: CreateSurveyInput): Promise<number> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('survey')
    .insert([
      {
        project_id: input.projectId,
        source: input.source,
        status: input.status ?? 'draft',
        trigger: input.trigger,
        custom_guidance: input.customGuidance ?? null,
        period_month: input.periodMonth ?? null,
        review_deadline_at: input.reviewDeadlineAt?.toISOString() ?? null,
        scheduled_send_at: input.scheduledSendAt?.toISOString() ?? null,
        health_context_snapshot: input.healthContext ?? null,
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
export async function findOrCreateAutoPulseSurvey(
  projectId: number,
  periodMonth: string,
  trigger: string,
  healthContext?: SurveyHealthContext,
): Promise<number> {
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

  return createSurvey({
    projectId,
    source: 'auto_pulse',
    trigger,
    periodMonth,
    status: 'draft',
    healthContext,
  });
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

/** Atomically opens a survey the first time its shared link is broadcast. */
export async function markSurveySent(surveyId: number, sentAt: Date = new Date()): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client
    .from('survey')
    .update({ status: 'active', sent_at: sentAt.toISOString(), analysis_error: null })
    .eq('id', surveyId)
    .is('sent_at', null);
  if (error) {
    throw new Error(`Failed to mark survey ${surveyId} sent: ${error.message}`);
  }
}

/** Claims an unsent survey so lifecycle actions cannot race its broadcast. */
export async function claimSurveyForSend(surveyId: number): Promise<boolean> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('survey')
    .update({ status: 'sending', analysis_error: null })
    .eq('id', surveyId)
    .is('sent_at', null)
    .in('status', ['draft', 'in_review', 'scheduled', 'sending', 'failed'])
    .select('id');
  if (error) {
    throw new Error(`Failed to claim survey ${surveyId} for delivery: ${error.message}`);
  }
  return (data?.length ?? 0) > 0;
}

export async function setSurveyReviewWindow(surveyId: number, scheduledSendAt: Date): Promise<void> {
  const client = assertSupabaseClient();
  const iso = scheduledSendAt.toISOString();
  const { error } = await client
    .from('survey')
    .update({ status: 'in_review', review_deadline_at: iso, scheduled_send_at: iso, analysis_error: null })
    .eq('id', surveyId)
    .is('sent_at', null)
    .in('status', ['draft', 'in_review', 'failed']);
  if (error) {
    throw new Error(`Failed to set review window for survey ${surveyId}: ${error.message}`);
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
    .order('created_at', { ascending: false });

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

  let query = client.from('survey').select('*').order('created_at', { ascending: false });
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
    .gte('created_at', startOfMonth.toISOString());

  if (error) {
    throw new Error(`Failed to count manual surveys for project ${projectId}: ${error.message}`);
  }
  return count ?? 0;
}

export async function updateSurveyStatus(
  surveyId: number,
  status: SurveyStatus,
  options?: { completedAt?: Date; closedAt?: Date; closeReason?: string; analysisError?: string | null },
): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client
    .from('survey')
    .update({
      status,
      ...(options?.completedAt ? { completed_at: options.completedAt.toISOString() } : {}),
      ...(options?.closedAt ? { closed_at: options.closedAt.toISOString() } : {}),
      ...(options?.closeReason ? { close_reason: options.closeReason } : {}),
      ...(options?.analysisError !== undefined ? { analysis_error: options.analysisError } : {}),
    })
    .eq('id', surveyId);

  if (error) {
    throw new Error(`Failed to update survey ${surveyId} status: ${error.message}`);
  }
}

export async function transitionUnsentSurveyStatus(
  surveyId: number,
  from: SurveyStatus[],
  to: SurveyStatus,
  analysisError?: string | null,
): Promise<boolean> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('survey')
    .update({ status: to, ...(analysisError !== undefined ? { analysis_error: analysisError } : {}) })
    .eq('id', surveyId)
    .is('sent_at', null)
    .in('status', from)
    .select('id');
  if (error) {
    throw new Error(`Failed to transition survey ${surveyId} to ${to}: ${error.message}`);
  }
  return (data?.length ?? 0) > 0;
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

export async function setSurveyTargetCount(surveyId: number, targetCount: number): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client
    .from('survey')
    .update({ target_count: Math.max(0, targetCount) })
    .eq('id', surveyId);
  if (error) {
    throw new Error(`Failed to set survey ${surveyId} target_count: ${error.message}`);
  }
}

/**
 * The audience target is stored on the survey. Anonymous response count is
 * derived directly from responses submitted through that survey's shared
 * links; no user or project-member identity is involved.
 */
export async function getDerivedCounts(surveyId: number): Promise<{ targetCount: number; responseCount: number }> {
  const client = assertSupabaseClient();

  const { data: survey, error: surveyError } = await client
    .from('survey')
    .select('target_count')
    .eq('id', surveyId)
    .maybeSingle();
  if (surveyError) {
    throw new Error(`Failed to load target count for survey ${surveyId}: ${surveyError.message}`);
  }

  const { data: links, error: linkError } = await client
    .from('surveybundle')
    .select('id')
    .eq('survey_id', surveyId);
  if (linkError) {
    throw new Error(`Failed to load links for survey ${surveyId}: ${linkError.message}`);
  }
  const bundleIds = (links ?? []).map((link) => link.id as number);
  if (bundleIds.length === 0) {
    return { targetCount: (survey?.target_count as number) ?? 0, responseCount: 0 };
  }

  const { count: responseCount, error: responseError } = await client
    .from('surveyresponse')
    .select('id', { count: 'exact', head: true })
    .in('bundle_id', bundleIds);
  if (responseError) {
    throw new Error(`Failed to compute response count for survey ${surveyId}: ${responseError.message}`);
  }

  return { targetCount: (survey?.target_count as number) ?? 0, responseCount: responseCount ?? 0 };
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
