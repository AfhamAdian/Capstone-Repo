/**
 * Survey Category Service
 * Admin-facing CRUD for organizing survey questions into categories. Built-in
 * categories (the five rubric buckets) are protected: they can't be deleted and
 * their key/rubric mapping can't change. Custom categories map to a rubric bucket
 * so AI scoring/blending keeps working.
 */

import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryById,
  getCategoryByKey,
  countQuestionsUsingCategory,
  RUBRIC_CATEGORIES,
  type RubricCategory,
  type SurveyCategoryRow,
} from '../database/survey-category.js';

export class CategoryValidationError extends Error {}
export class CategoryNotFoundError extends Error {}
export class CategoryConflictError extends Error {}

function isRubricCategory(value: unknown): value is RubricCategory {
  return typeof value === 'string' && (RUBRIC_CATEGORIES as readonly string[]).includes(value);
}

function normalizeKey(label: string): string {
  const camel = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
  return camel || `category${Date.now()}`;
}

export class SurveyCategoryService {
  async list(): Promise<SurveyCategoryRow[]> {
    return listCategories();
  }

  async create(input: { key?: string; label?: string; description?: string; rubricCategory?: string }): Promise<SurveyCategoryRow> {
    if (!input.label || input.label.trim().length === 0) {
      throw new CategoryValidationError('label is required');
    }
    if (!isRubricCategory(input.rubricCategory)) {
      throw new CategoryValidationError(`rubricCategory must be one of: ${RUBRIC_CATEGORIES.join(', ')}`);
    }
    const key = input.key && input.key.trim().length > 0 ? input.key.trim() : normalizeKey(input.label);

    const existing = await getCategoryByKey(key);
    if (existing) {
      throw new CategoryConflictError(`A category with key "${key}" already exists`);
    }

    return createCategory({ key, label: input.label.trim(), description: input.description, rubricCategory: input.rubricCategory });
  }

  async update(id: number, input: { label?: string; description?: string; rubricCategory?: string }): Promise<SurveyCategoryRow> {
    const existing = await getCategoryById(id);
    if (!existing) {
      throw new CategoryNotFoundError(`Category ${id} not found`);
    }
    if (existing.is_builtin && input.rubricCategory !== undefined && input.rubricCategory !== existing.rubric_category) {
      throw new CategoryValidationError("A built-in category's rubric mapping cannot be changed");
    }
    if (input.rubricCategory !== undefined && !isRubricCategory(input.rubricCategory)) {
      throw new CategoryValidationError(`rubricCategory must be one of: ${RUBRIC_CATEGORIES.join(', ')}`);
    }

    const updated = await updateCategory(id, {
      label: input.label,
      description: input.description,
      rubricCategory: isRubricCategory(input.rubricCategory) ? input.rubricCategory : undefined,
    });
    if (!updated) {
      throw new CategoryNotFoundError(`Category ${id} not found`);
    }
    return updated;
  }

  async remove(id: number): Promise<void> {
    const existing = await getCategoryById(id);
    if (!existing) {
      throw new CategoryNotFoundError(`Category ${id} not found`);
    }
    if (existing.is_builtin) {
      throw new CategoryValidationError('Built-in categories cannot be deleted');
    }
    const inUse = await countQuestionsUsingCategory(existing.key);
    if (inUse > 0) {
      throw new CategoryConflictError(`Category is used by ${inUse} question(s) and cannot be deleted`);
    }
    await deleteCategory(id);
  }
}
