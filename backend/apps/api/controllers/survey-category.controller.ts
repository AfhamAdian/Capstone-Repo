/**
 * Survey Category Controller (admin-facing CRUD)
 */

import type { Request, Response } from 'express';
import {
  SurveyCategoryService,
  CategoryValidationError,
  CategoryNotFoundError,
  CategoryConflictError,
} from '../services/survey-category.service.js';

const categoryService = new SurveyCategoryService();

function parseId(request: Request, response: Response): number | null {
  const id = Number(request.params.categoryId);
  if (!Number.isFinite(id) || id <= 0) {
    response.status(400).json({ message: 'categoryId must be a positive number' });
    return null;
  }
  return id;
}

function handleError(error: unknown, response: Response, fallback: string): void {
  if (error instanceof CategoryValidationError) {
    response.status(400).json({ message: error.message });
    return;
  }
  if (error instanceof CategoryNotFoundError) {
    response.status(404).json({ message: error.message });
    return;
  }
  if (error instanceof CategoryConflictError) {
    response.status(409).json({ message: error.message });
    return;
  }
  response.status(500).json({ message: error instanceof Error ? error.message : fallback });
}

/** GET /api/v1/survey-categories */
export async function listSurveyCategories(_request: Request, response: Response): Promise<void> {
  try {
    const categories = await categoryService.list();
    response.status(200).json({ categories });
  } catch (error) {
    handleError(error, response, 'Failed to list categories');
  }
}

/** POST /api/v1/survey-categories */
export async function createSurveyCategory(request: Request, response: Response): Promise<void> {
  try {
    const { key, label, description, rubricCategory } = request.body as {
      key?: string;
      label?: string;
      description?: string;
      rubricCategory?: string;
    };
    const category = await categoryService.create({ key, label, description, rubricCategory });
    response.status(201).json({ category });
  } catch (error) {
    handleError(error, response, 'Failed to create category');
  }
}

/** PATCH /api/v1/survey-categories/:categoryId */
export async function updateSurveyCategory(request: Request, response: Response): Promise<void> {
  const id = parseId(request, response);
  if (id === null) return;
  try {
    const { label, description, rubricCategory } = request.body as {
      label?: string;
      description?: string;
      rubricCategory?: string;
    };
    const category = await categoryService.update(id, { label, description, rubricCategory });
    response.status(200).json({ category });
  } catch (error) {
    handleError(error, response, 'Failed to update category');
  }
}

/** DELETE /api/v1/survey-categories/:categoryId */
export async function deleteSurveyCategory(request: Request, response: Response): Promise<void> {
  const id = parseId(request, response);
  if (id === null) return;
  try {
    await categoryService.remove(id);
    response.status(204).send();
  } catch (error) {
    handleError(error, response, 'Failed to delete category');
  }
}
