/**
 * Global Survey Routes (mounted at /api/v1/surveys)
 */

import { Router } from 'express';
import {
  listGlobalSurveys,
  getSurveyDetail,
  completeSurvey,
  closeSurveyForm,
  remindSurveyForm,
  updateSurveyQuestions,
  changeSurveyLifecycle,
} from '../controllers/survey.controller.js';
import { requireSurveyAdmin } from '../middlewares/survey-auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const surveyRouter = Router();

/** GET /api/v1/surveys?projectId=&status=&q= - admin only */
surveyRouter.get('/', ...requireSurveyAdmin, asyncHandler(listGlobalSurveys));

/** GET /api/v1/surveys/:surveyId - admin only */
surveyRouter.get('/:surveyId', ...requireSurveyAdmin, asyncHandler(getSurveyDetail));

/** PATCH /api/v1/surveys/:surveyId/questions - admin only, locked once responses exist */
surveyRouter.patch('/:surveyId/questions', ...requireSurveyAdmin, asyncHandler(updateSurveyQuestions));

/** PATCH /api/v1/surveys/:surveyId/complete - admin only */
surveyRouter.patch('/:surveyId/complete', ...requireSurveyAdmin, asyncHandler(completeSurvey));

/** POST /api/v1/surveys/:surveyId/close - admin only */
surveyRouter.post('/:surveyId/close', ...requireSurveyAdmin, asyncHandler(closeSurveyForm));

/** POST /api/v1/surveys/:surveyId/remind - admin only */
surveyRouter.post('/:surveyId/remind', ...requireSurveyAdmin, asyncHandler(remindSurveyForm));

/** PATCH /api/v1/surveys/:surveyId/lifecycle - admin only */
surveyRouter.patch('/:surveyId/lifecycle', ...requireSurveyAdmin, asyncHandler(changeSurveyLifecycle));
