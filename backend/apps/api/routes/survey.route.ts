/**
 * Global Survey Routes (mounted at /api/v1/surveys)
 */

import { Router } from 'express';
import { listGlobalSurveys, getSurveyDetail, completeSurvey, updateSurveyQuestions } from '../controllers/survey.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const surveyRouter = Router();

/** GET /api/v1/surveys?projectId=&status=&q= */
surveyRouter.get('/', asyncHandler(listGlobalSurveys));

/** GET /api/v1/surveys/:surveyId */
surveyRouter.get('/:surveyId', asyncHandler(getSurveyDetail));

/** PATCH /api/v1/surveys/:surveyId/questions - level-1 only, locked once responses exist */
surveyRouter.patch('/:surveyId/questions', asyncHandler(updateSurveyQuestions));

/** PATCH /api/v1/surveys/:surveyId/complete */
surveyRouter.patch('/:surveyId/complete', asyncHandler(completeSurvey));
