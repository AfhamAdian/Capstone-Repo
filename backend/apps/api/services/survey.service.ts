/**
 * Survey Service
 * Admin-facing survey lifecycle: question generation, create+send, listing, detail, completion, quota.
 */

import type { AiClient, GeneratedSurveyQuestion, ScoredSurveyQuestion } from '@libs/ai/index.js';
import { dedupeQuestions } from '@libs/ai/index.js';
import type { SurveyQueueManager } from '@libs/queue/index.js';
import { logger } from '@libs/logger.js';
import {
  createSurvey,
  replaceSurveyQuestions,
  getSurveyById,
  listSurveysForProject,
  listSurveysGlobal,
  countManualSurveysThisMonth,
  updateSurveyStatus,
  transitionUnsentSurveyStatus,
  getDerivedCounts,
  getRawResponsesForSurvey,
  listCategoryKeys,
  listMonthlyPulse,
  updateSurveyDelivery,
  type SurveyStatus,
  type SurveyRow,
} from '../database/survey.js';
import { getProjectName, getPendingSurvey as getPendingSurveyFromDb } from '../database/project.js';
import { captureSurveyHealthContext } from '../database/project-health-score.js';
import { generateQualityQuestions } from './survey-question-generation.service.js';
import { publicSurveyUrlFor } from './survey-dispatch.service.js';
import { broadcastSurveyLink } from '@libs/notifications/index.js';
import { isLevel1 } from '../utils/requester-role.js';
import { ForbiddenError } from '../utils/errors.js';
import { periodMonthString } from '../utils/period-month.js';
import { env } from '../config/env.js';

export { ForbiddenError };
export class SurveyNotFoundError extends Error {}
export class SurveyLockedError extends Error {}
export class SurveyValidationError extends Error {}
export type SurveyLifecycleAction = 'pause' | 'resume' | 'retry' | 'cancel' | 'close';

async function validateSurveyQuestions(questions: GeneratedSurveyQuestion[]): Promise<GeneratedSurveyQuestion[]> {
  if (questions.length === 0 || questions.length > 20) {
    throw new SurveyValidationError('A survey must contain between 1 and 20 questions');
  }
  const categoryKeys = new Set(listCategoryKeys());
  const normalized = questions.map((question) => ({
    category: typeof question.category === 'string' ? question.category.trim() : '',
    questionText: typeof question.questionText === 'string' ? question.questionText.trim() : '',
    questionType: question.questionType,
  }));
  for (const question of normalized) {
    if (!categoryKeys.has(question.category)) throw new SurveyValidationError(`Unknown survey category: ${question.category}`);
    if (question.questionText.length < 10 || question.questionText.length > 500) {
      throw new SurveyValidationError('Question text must contain between 10 and 500 characters');
    }
    if (question.questionType !== 'text' && question.questionType !== 'scale') {
      throw new SurveyValidationError('Question type must be text or scale');
    }
  }
  if (dedupeQuestions(normalized).length !== normalized.length) {
    throw new SurveyValidationError('Survey questions must not contain duplicates');
  }
  return normalized;
}

function normalizeSurveyText(trigger: string, customGuidance?: string): { trigger: string; customGuidance?: string } {
  const normalizedTrigger = trigger.trim();
  const normalizedGuidance = customGuidance?.trim();
  if (normalizedTrigger.length < 3 || normalizedTrigger.length > 500) {
    throw new SurveyValidationError('Survey trigger must contain between 3 and 500 characters');
  }
  if (normalizedGuidance && normalizedGuidance.length > 2000) {
    throw new SurveyValidationError('Custom guidance must not exceed 2000 characters');
  }
  return { trigger: normalizedTrigger, ...(normalizedGuidance ? { customGuidance: normalizedGuidance } : {}) };
}

interface SurveyServiceDependencies {
  aiClient: AiClient;
  surveyQueueManager: SurveyQueueManager;
}

export interface SurveyScores {
  delivery: number;
  codeQuality: number;
  cicd: number;
  teamHealth: number;
  blockers: number;
}

export interface SurveyListItem {
  id: number;
  projectId: number;
  projectName: string;
  status: SurveyStatus;
  trigger: string;
  sentDate: string | null;
  responseCount: number;
  targetCount: number;
  reviewDeadlineAt: string | null;
  scheduledSendAt: string | null;
  closedAt: string | null;
  questionVersion: number;
  /** Questions are immutable once their shared link has been broadcast. */
  questionsLocked: boolean;
  scores: SurveyScores | null;
  themes: string[];
  aiInsight: string | null;
  publicUrl: string | null;
}

export interface SurveyDetail extends SurveyListItem {
  rawResponses: { question: string; answers: string[] }[];
  questions: { id: number; category: string; questionText: string; questionType: 'text' | 'scale' }[];
  healthContext: SurveyRow['health_context'];
  analysisError: string | null;
  delivery: {
    notifiedAt: string | null;
    expiresAt: string;
    channels: { slackSent?: boolean; telegramSent?: boolean; discordSent?: boolean };
  } | null;
}

export interface SurveyScheduleSummary {
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
    const normalized = normalizeSurveyText(trigger, customGuidance);
    const [projectName, healthContext] = await Promise.all([
      getProjectName(projectId),
      captureSurveyHealthContext(projectId),
    ]);
    return generateQualityQuestions({
      aiClient: this.deps.aiClient,
      projectName,
      trigger: normalized.trigger,
      customGuidance: normalized.customGuidance,
      categories: listCategoryKeys(),
      healthContext,
    });
  }

  /**
   * Level-1 (CEO/CTO) question editing before dispatch.
   * Questions freeze once the shared link has been broadcast.
   */
  async editQuestions(surveyId: number, questions: GeneratedSurveyQuestion[], requesterRole: string | null): Promise<void> {
    if (!isLevel1(requesterRole)) {
      throw new ForbiddenError('Only level-1 users (CEO/CTO) can edit survey questions');
    }
    const survey = await getSurveyById(surveyId);
    if (!survey) {
      throw new SurveyNotFoundError(`Survey ${surveyId} not found`);
    }

    if (survey.sent_at) {
      throw new SurveyLockedError('This survey has been sent and its questions can no longer be edited');
    }

    const validatedQuestions = await validateSurveyQuestions(questions);
    await replaceSurveyQuestions(surveyId, validatedQuestions);
  }

  async createAndSendSurvey(
    projectId: number,
    input: { trigger: string; customGuidance?: string; questions: GeneratedSurveyQuestion[]; targetCount?: number },
  ): Promise<{ surveyId: number }> {
    const used = await countManualSurveysThisMonth(projectId);
    if (used >= env.manualSurveyMonthlyLimit) {
      throw new Error(`Monthly manual survey limit reached (${env.manualSurveyMonthlyLimit}/month)`);
    }

    const normalized = normalizeSurveyText(input.trigger, input.customGuidance);
    const validatedQuestions = await validateSurveyQuestions(input.questions);
    const healthContext = await captureSurveyHealthContext(projectId);
    const surveyId = await createSurvey({
      projectId,
      source: 'manual',
      trigger: normalized.trigger,
      customGuidance: normalized.customGuidance,
      status: 'draft',
      scheduledSendAt: new Date(),
      healthContext,
      questions: validatedQuestions.map((question, index) => ({ id: index + 1, ...question })),
      targetCount: input.targetCount,
    });

    await this.deps.surveyQueueManager.enqueueSurveySend(surveyId);
    this.log.info({ surveyId, projectId }, 'manual survey created and send job enqueued');

    return { surveyId };
  }

  /**
   * Create a manual survey and enqueue background question generation + delivery.
   */
  async sendNow(
    projectId: number,
    input: { trigger?: string; customGuidance?: string; targetCount?: number } = {},
  ): Promise<{ surveyId: number; queued: true }> {
    const used = await countManualSurveysThisMonth(projectId);
    if (used >= env.manualSurveyMonthlyLimit) {
      throw new Error(`Monthly manual survey limit reached (${env.manualSurveyMonthlyLimit}/month)`);
    }

    const trigger = input.trigger?.trim() || 'Manual team pulse check';
    const healthContext = await captureSurveyHealthContext(projectId);
    const surveyId = await createSurvey({
      projectId,
      source: 'manual',
      trigger,
      customGuidance: input.customGuidance,
      status: 'draft',
      scheduledSendAt: new Date(),
      healthContext,
      questions: [],
      targetCount: input.targetCount,
    });

    await this.deps.surveyQueueManager.enqueueSurveySend(surveyId);
    this.log.info({ surveyId, projectId }, 'manual survey created; generate-and-send job enqueued');
    return { surveyId, queued: true };
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

    const projectName = await getProjectName(survey.project_id);
    const listItem = await this.toListItem(survey, projectName);
    const rawResponses =
      listItem.responseCount >= env.surveyMinAnonymousResponses
        ? await getRawResponsesForSurvey(surveyId)
        : [];

    return {
      ...listItem,
      rawResponses: rawResponses.map((r) => ({ question: r.question, answers: r.answers })),
      questions: survey.questions,
      healthContext: survey.health_context,
      analysisError: survey.analysis_error,
      delivery: survey.expires_at
        ? {
            notifiedAt: survey.notified_at,
            expiresAt: survey.expires_at,
            channels: survey.delivery ?? {},
          }
        : null,
    };
  }

  async completeSurvey(surveyId: number): Promise<void> {
    const survey = await getSurveyById(surveyId);
    if (!survey) throw new SurveyNotFoundError(`Survey ${surveyId} not found`);
    if (survey.status === 'completed' && survey.insight) return;
    if (survey.status === 'active') {
      await updateSurveyStatus(surveyId, 'closed', {
        closedAt: new Date(),
        closeReason: 'manual',
      });
    }
    await this.deps.surveyQueueManager.enqueueSurveyInsight(surveyId);
  }

  async remindActiveSurvey(surveyId: number): Promise<{ remindedAt: string }> {
    const survey = await getSurveyById(surveyId);
    if (!survey) throw new SurveyNotFoundError(`Survey ${surveyId} not found`);
    if (survey.status !== 'active') {
      throw new SurveyLockedError('Only an active survey can be reminded');
    }
    const url = publicSurveyUrlFor(survey);
    if (!url || !survey.expires_at) {
      throw new SurveyLockedError('This survey does not have a public link yet');
    }

    const lastReminded = survey.delivery?.lastRemindedAt;
    const cooldownMs = 15 * 60 * 1000;
    if (lastReminded && Date.now() - new Date(lastReminded).getTime() < cooldownMs) {
      throw new SurveyLockedError('A reminder was sent recently. Try again in a few minutes.');
    }

    const projectName = await getProjectName(survey.project_id);
    const channels = await broadcastSurveyLink({
      url,
      projectNames: [projectName],
      deadline: new Date(survey.expires_at),
      kind: 'reminder',
    });
    if (!channels.slackSent && !channels.telegramSent && !channels.discordSent) {
      throw new Error('Reminder was not delivered: configure at least one broadcast channel');
    }

    const remindedAt = new Date().toISOString();
    await updateSurveyDelivery(surveyId, {
      ...survey.delivery,
      ...channels,
      lastRemindedAt: remindedAt,
    });
    this.log.info({ surveyId, channels }, 'anonymous survey reminder broadcast');
    return { remindedAt };
  }

  async changeLifecycle(surveyId: number, action: SurveyLifecycleAction): Promise<void> {
    const survey = await getSurveyById(surveyId);
    if (!survey) throw new SurveyNotFoundError(`Survey ${surveyId} not found`);

    if (action === 'close') {
      if (survey.status !== 'active') throw new SurveyLockedError('Only an active survey can be closed');
      await this.completeSurvey(surveyId);
      return;
    }

    if (action === 'retry') {
      if (survey.status !== 'failed') {
        throw new SurveyLockedError('Only a failed survey can be retried');
      }
      if (survey.sent_at) {
        await updateSurveyStatus(surveyId, 'closed', { analysisError: null });
        await this.deps.surveyQueueManager.enqueueSurveyInsight(surveyId);
        return;
      }
      const retried = await transitionUnsentSurveyStatus(surveyId, ['failed'], 'draft', null);
      if (!retried) throw new SurveyLockedError('Survey state changed before retry');
      if (survey.source === 'manual') await this.deps.surveyQueueManager.enqueueSurveySend(surveyId);
      return;
    }

    if (survey.sent_at) {
      throw new SurveyLockedError('A survey cannot be paused, resumed, or cancelled after dispatch');
    }

    if (action === 'pause') {
      if (survey.status !== 'draft') {
        throw new SurveyLockedError(`Survey cannot be paused from ${survey.status}`);
      }
      const paused = await transitionUnsentSurveyStatus(surveyId, ['draft'], 'paused');
      if (!paused) throw new SurveyLockedError('Survey state changed before it could be paused');
      return;
    }

    if (action === 'resume') {
      if (survey.status !== 'paused') throw new SurveyLockedError('Only a paused survey can be resumed');
      const resumed = await transitionUnsentSurveyStatus(surveyId, ['paused'], 'draft');
      if (!resumed) throw new SurveyLockedError('Survey state changed before it could be resumed');
      return;
    }

    if (survey.status === 'cancelled') return;
    const cancelled = await transitionUnsentSurveyStatus(
      surveyId,
      ['draft', 'paused', 'failed'],
      'cancelled',
    );
    if (!cancelled) throw new SurveyLockedError('Survey state changed before it could be cancelled');
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
   * Admin-facing view into the current month's auto-pulse for a project.
   */
  async getSchedule(projectId: number): Promise<SurveyScheduleSummary[]> {
    const periodMonth = periodMonthString(new Date());
    const pulse = await listMonthlyPulse(projectId, periodMonth);
    if (!pulse || !pulse.scheduled_send_at) return [];
    return [{
      scheduledSendAt: pulse.scheduled_send_at,
      status: pulse.sent_at ? 'sent' : pulse.questions.length > 0 ? 'questions_ready' : 'pending',
      surveyId: pulse.id,
    }];
  }

  private async toListItem(survey: SurveyRow, projectName: string): Promise<SurveyListItem> {
    const derived = await getDerivedCounts(survey.id);
    const insight = survey.insight;
    return {
      id: survey.id,
      projectId: survey.project_id,
      projectName,
      status: survey.status,
      trigger: survey.trigger,
      sentDate: survey.sent_at,
      responseCount: derived.responseCount,
      targetCount: derived.targetCount || survey.target_count,
      reviewDeadlineAt: survey.scheduled_send_at,
      scheduledSendAt: survey.scheduled_send_at,
      closedAt: survey.closed_at,
      questionVersion: 1,
      questionsLocked: survey.sent_at !== null,
      scores: insight?.scores
        ? {
            delivery: insight.scores.delivery ?? 0,
            codeQuality: insight.scores.codeQuality ?? 0,
            cicd: insight.scores.cicd ?? 0,
            teamHealth: insight.scores.teamHealth ?? 0,
            blockers: insight.scores.blockers ?? 0,
          }
        : null,
      themes: insight?.themes ?? [],
      aiInsight: insight?.aiInsight ?? null,
      publicUrl: survey.status === 'active' ? safePublicSurveyUrl(survey) : null,
    };
  }
}

function safePublicSurveyUrl(survey: SurveyRow): string | null {
  try {
    return publicSurveyUrlFor(survey);
  } catch {
    return null;
  }
}
