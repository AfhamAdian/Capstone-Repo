/**
 * Public Survey Routes (mounted at /api/v1/public/surveys) - anonymous, token-driven, no auth.
 * Rate-limited defense-in-depth on top of the token's 256-bit entropy.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getSurveyByToken, submitSurveyResponse } from '../controllers/survey-public.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const surveyPublicRouter = Router();

const publicSurveyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

surveyPublicRouter.use(publicSurveyRateLimit);

/** GET /api/v1/public/surveys/:token */
surveyPublicRouter.get('/:token', asyncHandler(getSurveyByToken));

/** POST /api/v1/public/surveys/:token/responses */
surveyPublicRouter.post('/:token/responses', asyncHandler(submitSurveyResponse));
