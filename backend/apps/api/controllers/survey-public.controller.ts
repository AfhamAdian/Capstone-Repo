/**
 * Public Survey Controller (anonymous, token-driven - no auth of any kind exists in this backend)
 */

import type { Request, Response } from 'express';
import { SurveyResponseService, InvalidSurveyLinkError, SurveyLinkAlreadyUsedError } from '../services/survey-response.service.js';
import type { SubmittedAnswer } from '../database/survey-response.js';

const surveyResponseService = new SurveyResponseService();

/** GET /api/v1/public/surveys/:token */
export async function getSurveyByToken(request: Request, response: Response): Promise<void> {
  const { token } = request.params;
  if (!token) {
    response.status(400).json({ message: 'token is required' });
    return;
  }

  try {
    const form = await surveyResponseService.getFormForToken(token);
    response.status(200).json(form);
  } catch (error) {
    if (error instanceof InvalidSurveyLinkError) {
      response.status(400).json({ message: error.message });
      return;
    }
    if (error instanceof SurveyLinkAlreadyUsedError) {
      response.status(409).json({ message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to load survey';
    response.status(500).json({ message });
  }
}

/** POST /api/v1/public/surveys/:token/responses */
export async function submitSurveyResponse(request: Request, response: Response): Promise<void> {
  const { token } = request.params;
  if (!token) {
    response.status(400).json({ message: 'token is required' });
    return;
  }

  const { answers, submissionId } = request.body as { answers?: SubmittedAnswer[]; submissionId?: string };
  if (!Array.isArray(answers) || answers.length === 0) {
    response.status(400).json({ message: 'answers must be a non-empty array' });
    return;
  }
  if (!submissionId) {
    response.status(400).json({ message: 'submissionId is required' });
    return;
  }

  try {
    await surveyResponseService.submitResponse(token, submissionId, answers);
    response.status(200).json({ message: 'Thank you - your response has been recorded' });
  } catch (error) {
    if (error instanceof InvalidSurveyLinkError) {
      response.status(400).json({ message: error.message });
      return;
    }
    if (error instanceof SurveyLinkAlreadyUsedError) {
      response.status(409).json({ message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to submit survey response';
    response.status(500).json({ message });
  }
}
