/**
 * Survey Response Service (anonymous, token-driven)
 * Handles decoding the encrypted link, serving its project survey, and
 * accepting anonymous submissions.
 */

import { logger } from '@libs/logger.js';
import { decodeToken, isExpired } from '@libs/security/survey-token.js';
import { insertResponse, type SubmittedAnswer } from '../database/survey-response.js';
import { getSurveyById, type SurveyQuestion } from '../database/survey.js';
import { getProjectName } from '../database/project.js';

const log = logger.child({ component: 'survey-response-service' });

export class InvalidSurveyLinkError extends Error {}
export class SurveyLinkAlreadyUsedError extends Error {}

export interface SurveyFormProject {
  projectId: number;
  projectName: string;
  questions: { id: number; category: string; text: string; type: 'text' | 'scale' }[];
}

export class SurveyResponseService {
  /** Decodes the token, validates expiry statelessly, then confirms the survey is still active. */
  async getFormForToken(token: string): Promise<{ projects: SurveyFormProject[] }> {
    const survey = await this.loadOpenSurvey(token);
    const projectName = await getProjectName(survey.project_id);

    return {
      projects: [{
        projectId: survey.project_id,
        projectName,
        questions: survey.questions.map((q) => ({
          id: q.id,
          category: q.category,
          text: q.questionText,
          type: q.questionType,
        })),
      }],
    };
  }

  /**
   * Validates answers against the active survey behind the shared link and
   * persists one anonymous submission. Shared links are never consumed:
   * surveys close only at their deadline or through an admin action.
   */
  async submitResponse(token: string, submissionKey: string, answers: SubmittedAnswer[]): Promise<void> {
    if (answers.length === 0) throw new InvalidSurveyLinkError('At least one answer is required');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionKey)) {
      throw new InvalidSurveyLinkError('submissionId must be a UUID');
    }

    const survey = await this.loadOpenSurvey(token);
    validateSurveyAnswers(answers, survey.questions);
    await insertResponse(survey.id, submissionKey, answers);
    log.info({ surveyId: survey.id, answerCount: answers.length }, 'anonymous survey response recorded');
  }

  private async loadOpenSurvey(token: string) {
    const payload = decodeToken(token);
    if (!payload) throw new InvalidSurveyLinkError('Invalid or tampered survey link');
    if (isExpired(payload)) throw new InvalidSurveyLinkError('This survey link has expired');

    const survey = await getSurveyById(payload.surveyId);
    if (!survey) throw new InvalidSurveyLinkError('Survey link not found');
    if (
      survey.cycle_id !== payload.cycleId
      || !survey.expires_at
      || new Date(survey.expires_at).getTime() !== new Date(payload.deadline).getTime()
      || new Date(survey.expires_at) <= new Date()
    ) {
      throw new InvalidSurveyLinkError('Survey link does not match an open distribution');
    }
    if (survey.status !== 'active') throw new SurveyLinkAlreadyUsedError('This survey is not accepting responses');
    return survey;
  }
}

export function validateSurveyAnswers(answers: SubmittedAnswer[], questions: SurveyQuestion[]): void {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const seen = new Set<number>();

  for (const answer of answers) {
    if (!Number.isInteger(answer.questionId) || seen.has(answer.questionId)) {
      throw new InvalidSurveyLinkError('Each survey question may be answered once');
    }
    seen.add(answer.questionId);

    const question = questionById.get(answer.questionId);
    if (!question) throw new InvalidSurveyLinkError('An answer references a question outside this survey');

    if (question.questionType === 'scale') {
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
