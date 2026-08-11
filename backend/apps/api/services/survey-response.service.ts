/**
 * Survey Response Service (anonymous, token-driven)
 * Handles decoding the encrypted link, serving its project survey, and
 * accepting anonymous submissions.
 */

import { logger } from '@libs/logger.js';
import { decodeToken, isExpired } from '@libs/security/survey-token.js';
import { getBundleById, getSurveyForBundle } from '../database/survey-bundle.js';
import { insertResponse, type SubmittedAnswer } from '../database/survey-response.js';
import { getQuestionsForSurveys, getSurveyById, type SurveyQuestionRow } from '../database/survey.js';

const log = logger.child({ component: 'survey-response-service' });

export class InvalidSurveyLinkError extends Error {}
export class SurveyLinkAlreadyUsedError extends Error {}

export interface SurveyFormProject {
  projectId: number;
  projectName: string;
  questions: { id: number; category: string; text: string; type: 'text' | 'scale' }[];
}

export class SurveyResponseService {
  /** Decodes the token, validates expiry statelessly, then confirms the bundle is still pending. Does not consume it. */
  async getFormForToken(token: string): Promise<{ projects: SurveyFormProject[] }> {
    const payload = decodeToken(token);
    if (!payload) throw new InvalidSurveyLinkError('Invalid or tampered survey link');
    if (isExpired(payload)) throw new InvalidSurveyLinkError('This survey link has expired');

    const bundle = await getBundleById(payload.bundleId);
    if (!bundle) throw new InvalidSurveyLinkError('Survey link not found');
    if (
      bundle.cycle_id !== payload.cycleId
      || new Date(bundle.expires_at).getTime() !== new Date(payload.deadline).getTime()
      || new Date(bundle.expires_at) <= new Date()
    ) {
      throw new InvalidSurveyLinkError('Survey link does not match an open distribution');
    }
    if (bundle.status !== 'pending') throw new SurveyLinkAlreadyUsedError('This survey is closed');

    const linkedSurvey = await getSurveyForBundle(payload.bundleId);
    if (!linkedSurvey) throw new InvalidSurveyLinkError('Survey link has no survey');
    const survey = await getSurveyById(linkedSurvey.surveyId);
    if (!survey || survey.status !== 'active') {
      throw new SurveyLinkAlreadyUsedError('This survey is not accepting responses');
    }

    const questions = await getQuestionsForSurveys([linkedSurvey.surveyId]);
    const projects: SurveyFormProject[] = [{
      projectId: linkedSurvey.projectId,
      projectName: linkedSurvey.projectName,
      questions: questions.map((q) => ({
        id: q.id,
        category: q.category,
        text: q.question_text,
        type: q.question_type,
      })),
    }];

    return { projects };
  }

  /**
   * Validates answers against the active survey behind the shared link and
   * persists one anonymous submission. Shared links are never consumed:
   * surveys close only at their deadline or through an admin action.
   */
  async submitResponse(token: string, submissionKey: string, answers: SubmittedAnswer[]): Promise<void> {
    const payload = decodeToken(token);
    if (!payload) throw new InvalidSurveyLinkError('Invalid or tampered survey link');
    if (isExpired(payload)) throw new InvalidSurveyLinkError('This survey link has expired');
    if (answers.length === 0) throw new InvalidSurveyLinkError('At least one answer is required');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionKey)) {
      throw new InvalidSurveyLinkError('submissionId must be a UUID');
    }

    const bundle = await getBundleById(payload.bundleId);
    if (!bundle) throw new InvalidSurveyLinkError('Survey link not found');
    if (
      bundle.cycle_id !== payload.cycleId
      || new Date(bundle.expires_at).getTime() !== new Date(payload.deadline).getTime()
      || new Date(bundle.expires_at) <= new Date()
    ) {
      throw new InvalidSurveyLinkError('Survey link does not match an open distribution');
    }
    if (bundle.status !== 'pending') throw new SurveyLinkAlreadyUsedError('This survey is closed');

    const linkedSurvey = await getSurveyForBundle(payload.bundleId);
    if (!linkedSurvey) throw new InvalidSurveyLinkError('Survey link has no survey');
    const survey = await getSurveyById(linkedSurvey.surveyId);
    if (!survey || survey.status !== 'active') {
      throw new SurveyLinkAlreadyUsedError('This survey is not accepting responses');
    }

    const questions = await getQuestionsForSurveys([linkedSurvey.surveyId]);
    validateSurveyAnswers(answers, questions);
    await insertResponse(payload.bundleId, submissionKey, answers);
    log.info({ surveyId: linkedSurvey.surveyId, answerCount: answers.length }, 'anonymous survey response recorded');
  }
}

export function validateSurveyAnswers(answers: SubmittedAnswer[], questions: SurveyQuestionRow[]): void {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const seen = new Set<number>();

  for (const answer of answers) {
    if (!Number.isInteger(answer.questionId) || seen.has(answer.questionId)) {
      throw new InvalidSurveyLinkError('Each survey question may be answered once');
    }
    seen.add(answer.questionId);

    const question = questionById.get(answer.questionId);
    if (!question) throw new InvalidSurveyLinkError('An answer references a question outside this survey');

    if (question.question_type === 'scale') {
      if (!Number.isInteger(answer.answerScale) || answer.answerScale! < 1 || answer.answerScale! > 5 || answer.answerText != null) {
        throw new InvalidSurveyLinkError('Scale answers must be a whole number from 1 to 5');
      }
      continue;
    }

    const text = answer.answerText?.trim();
    if (!text || text.length > 4000 || answer.answerScale != null) {
      throw new InvalidSurveyLinkError('Text answers must contain between 1 and 4000 characters');
    }
    answer.answerText = text;
  }
}
