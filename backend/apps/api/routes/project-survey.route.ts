/**
 * Project-scoped Survey Routes (mounted at /api/v1/projects/:projectId/surveys and /api/v1/projects/:projectId/pending-survey)
 */

import { Router } from 'express';
import {
  generateSurveyQuestions,
  sendSurvey,
  sendSurveyNow,
  listProjectSurveys,
  getSurveyQuota,
  getSurveySchedule,
  getPendingSurvey,
} from '../controllers/survey.controller.js';
import { requireSurveyAdmin } from '../middlewares/survey-auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const projectSurveyRouter = Router({ mergeParams: true });

/** POST /api/v1/projects/:projectId/surveys/generate-questions - admin only */
projectSurveyRouter.post('/surveys/generate-questions', ...requireSurveyAdmin, asyncHandler(generateSurveyQuestions));

/** POST /api/v1/projects/:projectId/surveys/send-now - admin only */
projectSurveyRouter.post('/surveys/send-now', ...requireSurveyAdmin, asyncHandler(sendSurveyNow));

/** POST /api/v1/projects/:projectId/surveys - admin only */
projectSurveyRouter.post('/surveys', ...requireSurveyAdmin, asyncHandler(sendSurvey));

/** GET /api/v1/projects/:projectId/surveys - admin only */
projectSurveyRouter.get('/surveys', ...requireSurveyAdmin, asyncHandler(listProjectSurveys));

/** GET /api/v1/projects/:projectId/surveys/quota - admin only */
projectSurveyRouter.get('/surveys/quota', ...requireSurveyAdmin, asyncHandler(getSurveyQuota));

/** GET /api/v1/projects/:projectId/surveys/schedule - admin only */
projectSurveyRouter.get('/surveys/schedule', ...requireSurveyAdmin, asyncHandler(getSurveySchedule));

/** GET /api/v1/projects/:projectId/pending-survey - admin only */
projectSurveyRouter.get('/pending-survey', ...requireSurveyAdmin, asyncHandler(getPendingSurvey));
