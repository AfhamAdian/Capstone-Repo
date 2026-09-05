import { assertSupabaseClient } from '../config/supabase.js';
import type { GeneratedSurveyQuestion, QuestionSummary, SurveyHealthContext, SurveyQuestionCategory } from '@libs/ai/index.js';
import { formatSupabaseError, insertRow, updateMatching } from './supabase-write.js';

export const RUBRIC_CATEGORIES = [
  'security', 'reliability', 'maintainability', 'cicdDeploymentHealth', 'teamHealth', 'engineeringProcess', 'planningExecution',
] as const;
export type RubricCategory = (typeof RUBRIC_CATEGORIES)[number];

export type SurveyStatus = 'draft' | 'active' | 'paused' | 'closed' | 'completed' | 'cancelled' | 'failed';
export type SurveySource = 'manual' | 'auto_pulse';

export interface SurveyQuestion {
  id: number;
  category: string;
  questionText: string;
  questionType: 'text' | 'scale';
}

export interface SurveyDeliveryResults {
  slackSent?: boolean;
  telegramSent?: boolean;
  discordSent?: boolean;
  lastRemindedAt?: string;
}

export interface SurveyInsight {
  aiInsight: string | null;
  themes: string[];
  questionSummaries: QuestionSummary[];
  scores: {
    security: number | null;
    reliability: number | null;
    maintainability: number | null;
    cicdDeploymentHealth: number | null;
    teamHealth: number | null;
    engineeringProcess: number | null;
    planningExecution: number | null;
  };
  aiModel: string | null;
  generatedAt: string | null;
}

export interface CreateSurveyInput {
  projectId: number;
  source: SurveySource;
  trigger: string;
  customGuidance?: string;
  periodMonth?: string;
  status?: SurveyStatus;
  scheduledSendAt?: Date;
  healthContext?: SurveyHealthContext;
  questions?: SurveyQuestion[];
  targetCount?: number;
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
  scheduled_send_at: string | null;
  closed_at: string | null;
  close_reason: string | null;
  health_context: SurveyHealthContext | null;
  analysis_error: string | null;
  questions: SurveyQuestion[];
  cycle_id: string | null;
  expires_at: string | null;
  notified_at: string | null;
  delivery: SurveyDeliveryResults;
  insight: SurveyInsight | null;
  created_at?: string | null;
}

export function listCategoryKeys(): string[] {
  return [...RUBRIC_CATEGORIES];
}

export function isRubricCategory(value: string): value is RubricCategory {
  return (RUBRIC_CATEGORIES as readonly string[]).includes(value);
}

export function withQuestionIds(questions: GeneratedSurveyQuestion[]): SurveyQuestion[] {
  return questions.map((question, index) => ({
    id: index + 1,
    category: question.category,
    questionText: question.questionText,
    questionType: question.questionType,
  }));
}

function asQuestionArray(value: unknown): SurveyQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (item == null || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    const questionText =
      typeof raw.questionText === 'string' ? raw.questionText
        : typeof raw.question_text === 'string' ? raw.question_text
          : '';
    const questionType =
      raw.questionType === 'text' || raw.questionType === 'scale' ? raw.questionType
        : raw.question_type === 'text' || raw.question_type === 'scale' ? raw.question_type
          : null;
    if (!questionText || !questionType) return [];
    return [{
      id: Number.isInteger(raw.id) ? (raw.id as number) : index + 1,
      category: typeof raw.category === 'string' ? raw.category : 'blockers',
      questionText,
      questionType,
    }];
  });
}

function normalizeRow(row: SurveyRow): SurveyRow {
  return {
    ...row,
    questions: asQuestionArray(row.questions),
    delivery: row.delivery ?? {},
    insight: row.insight ?? null,
    health_context: row.health_context ?? null,
  };
}

export async function createSurvey(input: CreateSurveyInput): Promise<number> {
  const inserted = await insertRow('survey', {
    project_id: input.projectId,
    source: input.source,
    status: input.status ?? 'draft',
    trigger: input.trigger,
    custom_guidance: input.customGuidance ?? null,
    period_month: input.periodMonth ?? null,
    scheduled_send_at: input.scheduledSendAt?.toISOString() ?? null,
    health_context: input.healthContext ?? null,
    questions: input.questions ?? [],
    ...(typeof input.targetCount === 'number' ? { target_count: Math.max(0, input.targetCount) } : {}),
  });
  return inserted.id;
}

/** Finds this month's auto-pulse survey for a project, creating it if it doesn't exist yet. */
export async function getOrCreateMonthlyPulse(input: {
  projectId: number;
  periodMonth: string;
  trigger: string;
  scheduledSendAt: Date;
  healthContext?: SurveyHealthContext;
}): Promise<SurveyRow> {
  const client = assertSupabaseClient();

  const { data: existing, error: findError } = await client
    .from('survey')
    .select('*')
    .eq('project_id', input.projectId)
    .eq('source', 'auto_pulse')
    .eq('period_month', input.periodMonth)
    .maybeSingle();

  if (findError) {
    throw new Error(`Failed to look up auto-pulse survey: ${findError.message}`);
  }
  if (existing) {
    return normalizeRow(existing as SurveyRow);
  }

  try {
    const id = await createSurvey({
      projectId: input.projectId,
      source: 'auto_pulse',
      trigger: input.trigger,
      periodMonth: input.periodMonth,
      status: 'draft',
      scheduledSendAt: input.scheduledSendAt,
      healthContext: input.healthContext,
      questions: [],
    });
    const created = await getSurveyById(id);
    if (!created) throw new Error(`Failed to load auto-pulse survey ${id} after insert`);
    return created;
  } catch (error) {
    const { data: raced, error: refetchError } = await client
      .from('survey')
      .select('*')
      .eq('project_id', input.projectId)
      .eq('source', 'auto_pulse')
      .eq('period_month', input.periodMonth)
      .maybeSingle();
    if (refetchError || !raced) {
      throw error;
    }
    return normalizeRow(raced as SurveyRow);
  }
}

export async function replaceSurveyQuestions(surveyId: number, questions: GeneratedSurveyQuestion[]): Promise<void> {
  const { error } = await updateMatching(
    'survey',
    { questions: withQuestionIds(questions) },
    (query) => query.eq('id', surveyId).is('sent_at', null),
  );
  if (error) {
    throw new Error(`Failed to save survey questions: ${formatSupabaseError(error)}`);
  }
}

/** Latest unsent manual survey that an admin can still edit (draft or failed). */
export async function findOpenManualDraft(projectId: number): Promise<SurveyRow | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('survey')
    .select('*')
    .eq('project_id', projectId)
    .eq('source', 'manual')
    .is('sent_at', null)
    .in('status', ['draft', 'failed', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to find open manual draft for project ${projectId}: ${error.message}`);
  }
  return data ? normalizeRow(data as SurveyRow) : null;
}

export async function updateUnsentSurveyDraft(
  surveyId: number,
  patch: {
    questions?: SurveyQuestion[];
    trigger?: string;
    customGuidance?: string | null;
    healthContext?: SurveyHealthContext | null;
    scheduledSendAt?: Date;
    status?: SurveyStatus;
    analysisError?: string | null;
    targetCount?: number;
  },
): Promise<void> {
  const values: Record<string, unknown> = {};
  if (patch.questions) values.questions = patch.questions;
  if (patch.trigger !== undefined) values.trigger = patch.trigger;
  if (patch.customGuidance !== undefined) values.custom_guidance = patch.customGuidance;
  if (patch.healthContext !== undefined) values.health_context = patch.healthContext;
  if (patch.scheduledSendAt) values.scheduled_send_at = patch.scheduledSendAt.toISOString();
  if (patch.status) values.status = patch.status;
  if (patch.analysisError !== undefined) values.analysis_error = patch.analysisError;
  if (typeof patch.targetCount === 'number') values.target_count = Math.max(0, patch.targetCount);
  if (Object.keys(values).length === 0) return;

  const { error } = await updateMatching(
    'survey',
    values,
    (query) => query.eq('id', surveyId).is('sent_at', null),
  );
  if (error) {
    throw new Error(`Failed to update unsent survey ${surveyId}: ${formatSupabaseError(error)}`);
  }
}

/** Atomically opens a survey the first time its shared link is broadcast. */
export async function markSurveySent(surveyId: number, sentAt: Date = new Date()): Promise<void> {
  const { error } = await updateMatching(
    'survey',
    { status: 'active', sent_at: sentAt.toISOString(), analysis_error: null },
    (query) => query.eq('id', surveyId).is('sent_at', null),
  );
  if (error) {
    throw new Error(`Failed to mark survey ${surveyId} sent: ${formatSupabaseError(error)}`);
  }
}

/** Claims an unsent survey so lifecycle actions cannot race its broadcast. */
export async function claimSurveyForSend(
  surveyId: number,
  cycleId: string,
  expiresAt: Date,
): Promise<boolean> {
  const { data, error } = await updateMatching(
    'survey',
    { cycle_id: cycleId, expires_at: expiresAt.toISOString(), analysis_error: null },
    (query) =>
      query
        .eq('id', surveyId)
        .is('sent_at', null)
        .in('status', ['draft', 'failed']),
  );
  if (error) {
    throw new Error(`Failed to claim survey ${surveyId} for delivery: ${formatSupabaseError(error)}`);
  }
  return (data?.length ?? 0) > 0;
}

export async function markSurveyNotified(surveyId: number, delivery: SurveyDeliveryResults): Promise<void> {
  const { error } = await updateMatching(
    'survey',
    { notified_at: new Date().toISOString(), delivery },
    (query) => query.eq('id', surveyId).is('notified_at', null),
  );
  if (error) {
    throw new Error(`Failed to mark survey ${surveyId} notified: ${formatSupabaseError(error)}`);
  }
}

export async function updateSurveyDelivery(surveyId: number, delivery: SurveyDeliveryResults): Promise<void> {
  const { error } = await updateMatching(
    'survey',
    { delivery },
    (query) => query.eq('id', surveyId),
  );
  if (error) {
    throw new Error(`Failed to update survey ${surveyId} delivery: ${formatSupabaseError(error)}`);
  }
}

export async function getQuestionsForSurvey(surveyId: number): Promise<SurveyQuestion[]> {
  const survey = await getSurveyById(surveyId);
  return survey?.questions ?? [];
}

export async function getSurveyById(surveyId: number): Promise<SurveyRow | null> {
  const client = assertSupabaseClient();

  const { data, error } = await client.from('survey').select('*').eq('id', surveyId).maybeSingle();
  if (error) {
    throw new Error(`Failed to load survey ${surveyId}: ${error.message}`);
  }
  return data ? normalizeRow(data as SurveyRow) : null;
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
  return ((data as SurveyRow[]) ?? []).map(normalizeRow);
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
  return ((data as SurveyRow[]) ?? []).map(normalizeRow);
}

export async function countManualSurveysThisMonth(projectId: number): Promise<number> {
  const client = assertSupabaseClient();

  const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const { data, error } = await client
    .from('survey')
    .select('id, sent_at, created_at')
    .eq('project_id', projectId)
    .eq('source', 'manual');

  if (error) {
    if (error.code === '42703' || /created_at does not exist/i.test(error.message ?? '')) {
      const fallback = await client
        .from('survey')
        .select('id, sent_at')
        .eq('project_id', projectId)
        .eq('source', 'manual');
      if (fallback.error) {
        throw new Error(
          `Failed to count manual surveys for project ${projectId}: ${formatSupabaseError(fallback.error)}`,
        );
      }
      return countManualRowsThisMonth(fallback.data ?? [], startOfMonth);
    }
    throw new Error(`Failed to count manual surveys for project ${projectId}: ${formatSupabaseError(error)}`);
  }

  return countManualRowsThisMonth(data ?? [], startOfMonth);
}

function countManualRowsThisMonth(
  rows: Array<{ sent_at?: string | null; created_at?: string | null }>,
  startOfMonth: Date,
): number {
  return rows.filter((row) => {
    const stamp = row.created_at ?? row.sent_at;
    if (!stamp) return true;
    return new Date(stamp) >= startOfMonth;
  }).length;
}

export async function updateSurveyStatus(
  surveyId: number,
  status: SurveyStatus,
  options?: { completedAt?: Date; closedAt?: Date; closeReason?: string; analysisError?: string | null },
): Promise<void> {
  const { error } = await updateMatching(
    'survey',
    {
      status,
      ...(options?.completedAt ? { completed_at: options.completedAt.toISOString() } : {}),
      ...(options?.closedAt ? { closed_at: options.closedAt.toISOString() } : {}),
      ...(options?.closeReason ? { close_reason: options.closeReason } : {}),
      ...(options?.analysisError !== undefined ? { analysis_error: options.analysisError } : {}),
    },
    (query) => query.eq('id', surveyId),
  );

  if (error) {
    throw new Error(`Failed to update survey ${surveyId} status: ${formatSupabaseError(error)}`);
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

  const { count: responseCount, error: responseError } = await client
    .from('survey_response')
    .select('id', { count: 'exact', head: true })
    .eq('survey_id', surveyId);
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
  const survey = await getSurveyById(surveyId);
  if (!survey || survey.questions.length === 0) return [];

  const { data: responses, error } = await client
    .from('survey_response')
    .select('answers')
    .eq('survey_id', surveyId);
  if (error) {
    throw new Error(`Failed to load answers for survey ${surveyId}: ${error.message}`);
  }

  const answersByQuestion = new Map<number, string[]>();
  for (const row of responses ?? []) {
    const answers = Array.isArray(row.answers) ? row.answers : [];
    for (const answer of answers as Array<{ questionId?: number; answerText?: string; answerScale?: number }>) {
      if (!Number.isInteger(answer.questionId)) continue;
      const value = answer.answerText ?? (answer.answerScale != null ? String(answer.answerScale) : '');
      const list = answersByQuestion.get(answer.questionId!) ?? [];
      list.push(value);
      answersByQuestion.set(answer.questionId!, list);
    }
  }

  return survey.questions.map((question) => ({
    question: question.questionText,
    category: question.category,
    answers: answersByQuestion.get(question.id) ?? [],
  }));
}

export async function saveInsight(surveyId: number, insight: SurveyInsight): Promise<void> {
  const { error } = await updateMatching(
    'survey',
    { insight },
    (query) => query.eq('id', surveyId),
  );
  if (error) {
    throw new Error(`Failed to save survey insight for survey ${surveyId}: ${formatSupabaseError(error)}`);
  }
}

export async function getLatestInsightForProject(projectId: number): Promise<{ surveyId: number; insight: SurveyInsight } | null> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('survey')
    .select('id, insight, completed_at')
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .not('insight', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to find latest completed survey for project ${projectId}: ${error.message}`);
  }
  if (!data?.insight) return null;
  return { surveyId: data.id as number, insight: data.insight as SurveyInsight };
}

/** Auto-pulse rows whose question-generation lead time has arrived but questions are still empty. */
export async function listDueForQuestionGeneration(now: Date, leadDays: number): Promise<SurveyRow[]> {
  const client = assertSupabaseClient();
  const threshold = new Date(now.getTime() + leadDays * 24 * 60 * 60 * 1000);

  const { data, error } = await client
    .from('survey')
    .select('*')
    .eq('source', 'auto_pulse')
    .is('sent_at', null)
    .in('status', ['draft', 'failed'])
    .lte('scheduled_send_at', threshold.toISOString());
  if (error) {
    throw new Error(`Failed to list surveys due for question generation: ${error.message}`);
  }
  return ((data as SurveyRow[]) ?? [])
    .map(normalizeRow)
    .filter((survey) => survey.questions.length === 0);
}

/** Unsent drafts (auto-pulse or manual) whose send time has arrived. */
export async function listDueForSend(now: Date): Promise<SurveyRow[]> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('survey')
    .select('*')
    .is('sent_at', null)
    .in('status', ['draft'])
    .lte('scheduled_send_at', now.toISOString());
  if (error) {
    throw new Error(`Failed to list surveys due for send: ${error.message}`);
  }
  return ((data as SurveyRow[]) ?? []).map(normalizeRow);
}

export async function listMonthlyPulse(projectId: number, periodMonth: string): Promise<SurveyRow | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('survey')
    .select('*')
    .eq('project_id', projectId)
    .eq('source', 'auto_pulse')
    .eq('period_month', periodMonth)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load monthly pulse for project ${projectId}: ${error.message}`);
  }
  return data ? normalizeRow(data as SurveyRow) : null;
}

/** Closes every active survey whose anonymous link has expired. */
export async function expireDueSurveys(now: Date): Promise<number[]> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('survey')
    .update({ status: 'closed', closed_at: now.toISOString(), close_reason: 'deadline' })
    .eq('status', 'active')
    .not('expires_at', 'is', null)
    .lte('expires_at', now.toISOString())
    .select('id');
  if (error) {
    throw new Error(`Failed to expire due surveys: ${error.message}`);
  }
  return (data ?? []).map((row) => row.id as number);
}

export function categoryForAnalysis(category: string): SurveyQuestionCategory {
  return isRubricCategory(category) ? category : 'engineeringProcess';
}
