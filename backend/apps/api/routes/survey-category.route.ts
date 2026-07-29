/**
 * Survey Category Routes (mounted at /api/v1/survey-categories) - admin CRUD.
 */

import { Router } from 'express';
import {
  listSurveyCategories,
  createSurveyCategory,
  updateSurveyCategory,
  deleteSurveyCategory,
} from '../controllers/survey-category.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const surveyCategoryRouter = Router();

/** GET /api/v1/survey-categories */
surveyCategoryRouter.get('/', asyncHandler(listSurveyCategories));

/** POST /api/v1/survey-categories */
surveyCategoryRouter.post('/', asyncHandler(createSurveyCategory));

/** PATCH /api/v1/survey-categories/:categoryId */
surveyCategoryRouter.patch('/:categoryId', asyncHandler(updateSurveyCategory));

/** DELETE /api/v1/survey-categories/:categoryId */
surveyCategoryRouter.delete('/:categoryId', asyncHandler(deleteSurveyCategory));
