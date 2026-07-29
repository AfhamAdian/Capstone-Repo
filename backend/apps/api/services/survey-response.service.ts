/**
 * Survey Response Service (anonymous, token-driven)
 * Handles decoding the encrypted link, serving the combined multi-project
 * form, and accepting submissions split by project for scoring/insight.
 */

import { logger } from '@libs/logger.js';
import type { SurveyQueueManager } from '@libs/queue/index.js';
import { decodeToken, isExpired } from '@libs/security/survey-token.js';
import { isSingleUse } from '@libs/security/survey-link.js';
import { getBundleById, consumeBundle, getSurveysForBundle } from '../database/survey-bundle.js';
import { insertResponse, getSurveyIdsForQuestions, type SubmittedAnswer } from '../database/survey-response.js';
import { getQuestionsForSurveys, getDerivedCounts, updateSurveyStatus } from '../database/survey.js';

const log = logger.child({ component: 'survey-response-service' });

export class InvalidSurveyLinkError extends Error {}
export class SurveyLinkAlreadyUsedError extends Error {}

export interface SurveyFormProject {
  projectId: number;
  projectName: string;
  questions: { id: number; category: string; questionText: string; questionType: 'text' | 'scale' }[];
}

export class SurveyResponseService {
  constructor(private deps: { surveyQueueManager: SurveyQueueManager }) {}

  /** Decodes the token, validates expiry statelessly, then confirms the bundle is still pending. Does not consume it. */
  async getFormForToken(token: string): Promise<{ bundleId: number; projects: SurveyFormProject[] }> {
    const payload = decodeToken(token);
    if (!payload) throw new InvalidSurveyLinkError('Invalid or tampered survey link');
    if (isExpired(payload)) throw new InvalidSurveyLinkError('This survey link has expired');

    const bundle = await getBundleById(payload.bundleId);
    if (!bundle) throw new InvalidSurveyLinkError('Survey link not found');
    if (bundle.status !== 'pending') throw new SurveyLinkAlreadyUsedError('This survey has already been submitted');

    const surveys = await getSurveysForBundle(payload.bundleId);
    const surveyIds = surveys.map((s) => s.surveyId);
    const questions = await getQuestionsForSurveys(surveyIds);

    const projects: SurveyFormProject[] = surveys.map((s) => ({
      projectId: s.projectId,
      projectName: s.projectName,
      questions: questions
        .filter((q) => q.survey_id === s.surveyId)
        .map((q) => ({ id: q.id, category: q.category, questionText: q.question_text, questionType: q.question_type })),
    }));

    return { bundleId: payload.bundleId, projects };
  }

  /**
   * Consumes the link atomically, persists the answers, then checks each
   * touched project's survey for completion (response_count >= target_count)
   * and enqueues that project's insight job if so.
   */
  async submitResponse(token: string, answers: SubmittedAnswer[]): Promise<void> {
    const payload = decodeToken(token);
    if (!payload) throw new InvalidSurveyLinkError('Invalid or tampered survey link');
    if (isExpired(payload)) throw new InvalidSurveyLinkError('This survey link has expired');
    if (answers.length === 0) throw new InvalidSurveyLinkError('At least one answer is required');

    const bundle = await getBundleById(payload.bundleId);
    if (!bundle) throw new InvalidSurveyLinkError('Survey link not found');

    if (isSingleUse(bundle.mode)) {
      // Per-developer link: atomic single-use consumption prevents replay.
      const consumed = await consumeBundle(payload.bundleId);
      if (!consumed) {
        throw new SurveyLinkAlreadyUsedError('This survey link has already been used or has expired');
      }
    } else if (bundle.status !== 'pending') {
      // Shared cohort link: reusable by the whole cohort, so NOT consumed - but
      // still reject once the cohort link has been closed/expired.
      throw new SurveyLinkAlreadyUsedError('This survey is closed');
    }

    await insertResponse(payload.bundleId, answers);

    const questionIds = answers.map((a) => a.questionId);
    const surveyIdByQuestion = await getSurveyIdsForQuestions(questionIds);
    const touchedSurveyIds = [...new Set(surveyIdByQuestion.values())];

    await Promise.all(
      touchedSurveyIds.map(async (surveyId) => {
        try {
          const derived = await getDerivedCounts(surveyId);
          if (derived.targetCount > 0 && derived.responseCount >= derived.targetCount) {
            await updateSurveyStatus(surveyId, 'completed', new Date());
            await this.deps.surveyQueueManager.enqueueSurveyInsight(surveyId);
          }
        } catch (error) {
          log.error({ error, surveyId }, 'failed to check/trigger survey completion after response submit');
        }
      }),
    );
  }
}
