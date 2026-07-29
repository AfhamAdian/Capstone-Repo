/**
 * Public Survey Controller (anonymous, token-driven - no auth of any kind exists in this backend)
 */

import type { Request, Response } from 'express';
import { SurveyQueueManager } from '@libs/queue/index.js';
import { SurveyResponseService, InvalidSurveyLinkError, SurveyLinkAlreadyUsedError } from '../services/survey-response.service.js';
import type { SubmittedAnswer } from '../database/survey-response.js';
import { env } from '../config/env.js';

if (!env.redisUrl) {
  throw new Error('REDIS_URL is required to enqueue survey jobs');
}

const surveyQueueManager = new SurveyQueueManager({ redisUrl: env.redisUrl });
const surveyResponseService = new SurveyResponseService({ surveyQueueManager });

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

  const { answers } = request.body as { answers?: SubmittedAnswer[] };
  if (!Array.isArray(answers) || answers.length === 0) {
    response.status(400).json({ message: 'answers must be a non-empty array' });
    return;
  }

  try {
    await surveyResponseService.submitResponse(token, answers);
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
