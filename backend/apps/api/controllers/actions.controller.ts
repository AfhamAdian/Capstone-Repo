/**
 * Actions Controller
 * HTTP endpoints for management action logging.
 * Validation is inline (matching sync.controller.ts style); queries live in database/actions.ts.
 */

import type { Request, Response } from 'express';
import {
  listActions as queryActions,
  getActionById,
  updateActionEffectiveness,
  sanitizeActionSearchQuery,
  type ListActionsFilters,
} from '../database/actions.js';
import { createAction as createActionRecord } from '../services/actions.service.js';
import { searchActions as querySearchActions } from '../services/action-search.service.js';
import { env } from '../config/env.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PROJECTS = 50;
const MAX_PROJECT_ID_LENGTH = 200;
const MAX_TEXT_LENGTH = 5_000;
const MAX_LOGGED_BY_LENGTH = 320;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidDateOnly(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * POST /api/v1/actions
 * Log a new management action (requires Level 1+)
 */
export async function createAction(request: Request, response: Response): Promise<void> {
  try {
    const body = request.body as Record<string, unknown>;

    const projectIds = body.projectIds;
    if (
      !Array.isArray(projectIds)
      || projectIds.length === 0
      || projectIds.length > MAX_PROJECTS
      || !projectIds.every((value) => isNonEmptyString(value) && value.trim().length <= MAX_PROJECT_ID_LENGTH)
    ) {
      response.status(400).json({ message: 'projectIds must be a non-empty array of strings' });
      return;
    }

    const problem = body.problem;
    if (!isNonEmptyString(problem)) {
      response.status(400).json({ message: 'problem is required' });
      return;
    }
    if (problem.trim().length > MAX_TEXT_LENGTH) {
      response.status(400).json({ message: `problem must be at most ${MAX_TEXT_LENGTH} characters` });
      return;
    }

    const reason = body.reason;
    if (!isNonEmptyString(reason)) {
      response.status(400).json({ message: 'reason is required' });
      return;
    }
    if (reason.trim().length > MAX_TEXT_LENGTH) {
      response.status(400).json({ message: `reason must be at most ${MAX_TEXT_LENGTH} characters` });
      return;
    }

    const actionTaken = body.actionTaken;
    if (!isNonEmptyString(actionTaken)) {
      response.status(400).json({ message: 'actionTaken is required' });
      return;
    }
    if (actionTaken.trim().length > MAX_TEXT_LENGTH) {
      response.status(400).json({ message: `actionTaken must be at most ${MAX_TEXT_LENGTH} characters` });
      return;
    }

    const loggedBy = body.loggedBy;
    if (!isNonEmptyString(loggedBy)) {
      response.status(400).json({ message: 'loggedBy is required' });
      return;
    }
    if (loggedBy.trim().length > MAX_LOGGED_BY_LENGTH) {
      response.status(400).json({ message: `loggedBy must be at most ${MAX_LOGGED_BY_LENGTH} characters` });
      return;
    }

    let timestamp = new Date().toISOString().slice(0, 10);
    if (body.timestamp !== undefined) {
      if (typeof body.timestamp !== 'string' || !isValidDateOnly(body.timestamp)) {
        response.status(400).json({ message: 'timestamp must be in YYYY-MM-DD format' });
        return;
      }
      timestamp = body.timestamp;
    }

    const action = await createActionRecord({
      projectIds: (projectIds as string[]).map((id) => id.trim()),
      problem: problem.trim(),
      reason: reason.trim(),
      actionTaken: actionTaken.trim(),
      loggedBy: loggedBy.trim(),
      timestamp,
    });

    response.status(201).json(action);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create action';
    response.status(500).json({ message });
  }
}

/**
 * GET /api/v1/actions
 * List actions, optionally filtered by project, date range, or pending review
 */
export async function listActions(request: Request, response: Response): Promise<void> {
  try {
    const { projectId, from, to, pending, limit } = request.query;

    const filters: ListActionsFilters = {};

    if (typeof projectId === 'string' && projectId.length > 0) {
      filters.projectId = projectId;
    }

    if (typeof from === 'string' && DATE_RE.test(from)) {
      filters.from = from;
    }

    if (typeof to === 'string' && DATE_RE.test(to)) {
      filters.to = to;
    }

    if (pending === 'true') {
      filters.pendingOnly = true;
    }

    if (typeof limit === 'string') {
      const parsed = Number.parseInt(limit, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        filters.limit = Math.min(parsed, 200);
      }
    }

    const actions = await queryActions(filters);
    response.status(200).json(actions);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list actions';
    response.status(500).json({ message });
  }
}

/**
 * GET /api/v1/actions/search
 * Hybrid semantic + lexical search with automatic lexical fallback
 */
export async function searchActions(request: Request, response: Response): Promise<void> {
  try {
    const { q, limit, projectId } = request.query;

    if (typeof q !== 'string' || q.trim().length < 3) {
      response.status(400).json({ message: 'Search query must be at least 3 characters' });
      return;
    }

    if (!sanitizeActionSearchQuery(q)) {
      response.status(400).json({ message: 'Search query must contain searchable text' });
      return;
    }

    let parsedLimit = 5;
    if (typeof limit === 'string') {
      const parsed = Number.parseInt(limit, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        parsedLimit = Math.min(parsed, env.actionSearchMaxResults);
      }
    }

    const result = await querySearchActions({
      query: q.trim(),
      limit: parsedLimit,
      projectId: typeof projectId === 'string' && projectId.trim() ? projectId.trim() : undefined,
    });
    response.setHeader('x-action-search-mode', result.mode);
    response.status(200).json(result.rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to search actions';
    response.status(500).json({ message });
  }
}

/**
 * GET /api/v1/actions/:id
 * Get a single action
 */
export async function getAction(request: Request, response: Response): Promise<void> {
  try {
    const { id } = request.params;

    if (!id) {
      response.status(400).json({ message: 'id is required' });
      return;
    }

    const action = await getActionById(id);

    if (!action) {
      response.status(404).json({ message: 'Action not found' });
      return;
    }

    response.status(200).json(action);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get action';
    response.status(500).json({ message });
  }
}

/**
 * PUT /api/v1/actions/:id/effectiveness
 * Rate an action's effectiveness 1-5 (requires Level 2+)
 */
export async function updateEffectiveness(request: Request, response: Response): Promise<void> {
  try {
    const { id } = request.params;

    if (!id) {
      response.status(400).json({ message: 'id is required' });
      return;
    }

    const body = request.body as Record<string, unknown>;
    const effectiveness = body.effectiveness;

    if (
      typeof effectiveness !== 'number'
      || !Number.isInteger(effectiveness)
      || effectiveness < 1
      || effectiveness > 5
    ) {
      response.status(400).json({ message: 'Effectiveness must be between 1 and 5' });
      return;
    }

    const action = await updateActionEffectiveness(id, effectiveness);

    if (!action) {
      response.status(404).json({ message: 'Action not found' });
      return;
    }

    response.status(200).json(action);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update effectiveness';
    response.status(500).json({ message });
  }
}
