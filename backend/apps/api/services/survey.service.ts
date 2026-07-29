/**
 * Survey Service
 * Admin-facing survey lifecycle: question generation, create+send, listing, detail, completion, quota.
 */

import type { AiClient, GeneratedSurveyQuestion, ScoredSurveyQuestion } from '@libs/ai/index.js';
import type { SurveyQueueManager } from '@libs/queue/index.js';
import { logger } from '@libs/logger.js';
import {
  createSurvey,
  addSurveyQuestions,
  deleteQuestionsForSurvey,
  getSurveyById,
  listSurveysForProject,
  listSurveysGlobal,
  countManualSurveysThisMonth,
  updateSurveyStatus,
  markQuestionsModified,
  getDerivedCounts,
  getRawResponsesForSurvey,
  type SurveyStatus,
  type SurveyRow,
} from '../database/survey.js';
import { getInsight } from '../database/survey-insight.js';
import { getProjectName, getPendingSurvey as getPendingSurveyFromDb } from '../database/project.js';
import { listCategoryKeys } from '../database/survey-category.js';
import { listSchedulesForProject } from '../database/survey-schedule.js';
import { generateQualityQuestions } from './survey-question-generation.service.js';
import { isLevel1 } from '../utils/requester-role.js';
import { ForbiddenError } from '../utils/errors.js';
import { periodMonthString } from '../utils/period-month.js';
import { env } from '../config/env.js';

export { ForbiddenError };
export class SurveyNotFoundError extends Error {}
export class SurveyLockedError extends Error {}

interface SurveyServiceDependencies {
  aiClient: AiClient;
  surveyQueueManager: SurveyQueueManager;
}

export interface SurveyListItem {
  id: number;
  projectId: number;
  projectName: string;
  status: SurveyStatus;
  trigger: string;
  sentDate: string;
  responseCount: number;
  targetCount: number;
  /** Null until the survey has actually been dispatched at least once. */
  firstSentAt: string | null;
  /** Set when questions were edited after first_sent_at - "modified" badge for the UI. */
  questionsModifiedAt: string | null;
  /** Questions can no longer be edited once >=1 response has been submitted. */
  questionsLocked: boolean;
}

export interface SurveyDetail extends SurveyListItem {
  scores: { delivery: number; codeQuality: number; cicd: number; teamHealth: number; blockers: number } | null;
  themes: string[];
  aiInsight: string | null;
  rawResponses: { question: string; answers: string[] }[];
}

export interface SurveyScheduleSummary {
  round: 1 | 2;
  scheduledSendAt: string;
  status: 'pending' | 'questions_ready' | 'sent';
  surveyId: number | null;
}


export class SurveyService {
  private readonly log = logger.child({ component: 'survey-service' });

  constructor(private deps: SurveyServiceDependencies) {}

  /**
   * Generates candidate questions, removes near-duplicates deterministically,
   * then has the AI score each on relevance/clarity/importance/diversity. Only
   * questions clearing the quality gate survive; the rest are dropped, and the
   * best `SURVEY_QUESTION_MAX_COUNT` are returned (with scores, for the modal).
   */
  async generateQuestions(projectId: number, trigger: string, customGuidance?: string): Promise<ScoredSurveyQuestion[]> {
    const [projectName, categories] = await Promise.all([getProjectName(projectId), listCategoryKeys()]);
    return generateQualityQuestions({ aiClient: this.deps.aiClient, projectName, trigger, customGuidance, categories });
  }

  /**
   * Level-1 (CEO/CTO) question editing. No approval gate exists - editing IS
   * the review step, available any time up until someone has answered.
   * - Blocked once >=1 response has been submitted (editing a live form out
   *   from under a respondent would corrupt already-collected answers).
   * - If the survey has already been dispatched at least once (`first_sent_at`
   *   set), the edit is tagged via `questions_modified_at` instead of silently
   *   rewriting a form recipients may already be looking at.
   */
  async editQuestions(surveyId: number, questions: GeneratedSurveyQuestion[], requesterRole: string | null): Promise<void> {
    if (!isLevel1(requesterRole)) {
      throw new ForbiddenError('Only level-1 users (CEO/CTO) can edit survey questions');
    }
    if (questions.length === 0) {
      throw new Error('questions must be a non-empty array');
    }

    const survey = await getSurveyById(surveyId);
    if (!survey) {
      throw new SurveyNotFoundError(`Survey ${surveyId} not found`);
    }

    const derived = await getDerivedCounts(surveyId);
    if (derived.responseCount > 0) {
      throw new SurveyLockedError('This survey already has responses and its questions can no longer be edited');
    }

    await deleteQuestionsForSurvey(surveyId);
    await addSurveyQuestions(surveyId, questions);

    if (survey.first_sent_at) {
      await markQuestionsModified(surveyId);
    }
  }

  async createAndSendSurvey(
    projectId: number,
    input: { trigger: string; customGuidance?: string; questions: GeneratedSurveyQuestion[] },
  ): Promise<{ surveyId: number }> {
    const used = await countManualSurveysThisMonth(projectId);
    if (used >= env.manualSurveyMonthlyLimit) {
      throw new Error(`Monthly manual survey limit reached (${env.manualSurveyMonthlyLimit}/month)`);
    }

    const surveyId = await createSurvey({
      projectId,
      source: 'manual',
      trigger: input.trigger,
      customGuidance: input.customGuidance,
    });
    await addSurveyQuestions(surveyId, input.questions);

    await this.deps.surveyQueueManager.enqueueSurveySend(surveyId);
    this.log.info({ surveyId, projectId }, 'manual survey created and send job enqueued');

    return { surveyId };
  }

  async listForProject(projectId: number): Promise<SurveyListItem[]> {
    const surveys = await listSurveysForProject(projectId);
    const projectName = await getProjectName(projectId);
    return Promise.all(surveys.map((s) => this.toListItem(s, projectName)));
  }

  async listGlobal(filters: { projectId?: number; status?: SurveyStatus; search?: string }): Promise<SurveyListItem[]> {
    const surveys = await listSurveysGlobal(filters);
    const projectNameCache = new Map<number, string>();
    return Promise.all(
      surveys.map(async (s) => {
        if (!projectNameCache.has(s.project_id)) {
          projectNameCache.set(s.project_id, await getProjectName(s.project_id));
        }
        return this.toListItem(s, projectNameCache.get(s.project_id)!);
      }),
    );
  }

  async getDetail(surveyId: number): Promise<SurveyDetail | null> {
    const survey = await getSurveyById(surveyId);
    if (!survey) return null;

    const [projectName, insight, rawResponses] = await Promise.all([
      getProjectName(survey.project_id),
      getInsight(surveyId),
      getRawResponsesForSurvey(surveyId),
    ]);
    const listItem = await this.toListItem(survey, projectName);

    return {
      ...listItem,
      scores: insight
        ? {
            delivery: insight.delivery_score ?? 0,
            codeQuality: insight.code_quality_score ?? 0,
            cicd: insight.cicd_score ?? 0,
            teamHealth: insight.team_health_score ?? 0,
            blockers: insight.blockers_score ?? 0,
          }
        : null,
      themes: insight?.themes ?? [],
      aiInsight: insight?.ai_insight ?? null,
      rawResponses: rawResponses.map((r) => ({ question: r.question, answers: r.answers })),
    };
  }

  async completeSurvey(surveyId: number): Promise<void> {
    await updateSurveyStatus(surveyId, 'completed', new Date());
    await this.deps.surveyQueueManager.enqueueSurveyInsight(surveyId);
  }

  async getQuota(projectId: number): Promise<{ used: number; limit: number; remaining: number }> {
    const used = await countManualSurveysThisMonth(projectId);
    const limit = env.manualSurveyMonthlyLimit;
    return { used, limit, remaining: Math.max(0, limit - used) };
  }

  async getPendingSurvey(projectId: number) {
    return getPendingSurveyFromDb(projectId);
  }

  /**
   * Admin-facing view into the current month's auto-pulse rounds for a
   * project - the `surveyschedule` rows are otherwise an internal worker
   * concern, invisible to the UI. Lets the frontend show e.g. "next pulse
   * survey: Aug 3" instead of the staggered rollout being a black box.
   */
  async getSchedule(projectId: number): Promise<SurveyScheduleSummary[]> {
    const periodMonth = periodMonthString(new Date());
    const rows = await listSchedulesForProject(projectId, periodMonth);
    return rows.map((row) => ({
      round: row.round,
      scheduledSendAt: row.scheduled_send_at,
      status: row.sent_at ? 'sent' : row.questions_generated_at ? 'questions_ready' : 'pending',
      surveyId: row.survey_id,
    }));
  }

  private async toListItem(survey: SurveyRow, projectName: string): Promise<SurveyListItem> {
    const derived = await getDerivedCounts(survey.id);
    return {
      id: survey.id,
      projectId: survey.project_id,
      projectName,
      status: survey.status,
      trigger: survey.trigger,
      sentDate: survey.sent_at,
      responseCount: derived.responseCount,
      targetCount: derived.targetCount || survey.target_count,
      firstSentAt: survey.first_sent_at,
      questionsModifiedAt: survey.questions_modified_at,
      questionsLocked: derived.responseCount > 0,
    };
  }
}
