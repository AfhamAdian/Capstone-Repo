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
import { asyncHandler } from '../utils/async-handler.js';

export const projectSurveyRouter = Router({ mergeParams: true });

/** POST /api/v1/projects/:projectId/surveys/generate-questions */
projectSurveyRouter.post('/surveys/generate-questions', asyncHandler(generateSurveyQuestions));

/** POST /api/v1/projects/:projectId/surveys/send-now */
projectSurveyRouter.post('/surveys/send-now', asyncHandler(sendSurveyNow));

/** POST /api/v1/projects/:projectId/surveys */
projectSurveyRouter.post('/surveys', asyncHandler(sendSurvey));

/** GET /api/v1/projects/:projectId/surveys */
projectSurveyRouter.get('/surveys', asyncHandler(listProjectSurveys));

/** GET /api/v1/projects/:projectId/surveys/quota */
projectSurveyRouter.get('/surveys/quota', asyncHandler(getSurveyQuota));

/** GET /api/v1/projects/:projectId/surveys/schedule */
projectSurveyRouter.get('/surveys/schedule', asyncHandler(getSurveySchedule));

/** GET /api/v1/projects/:projectId/pending-survey */
projectSurveyRouter.get('/pending-survey', asyncHandler(getPendingSurvey));
