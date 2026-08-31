/** Authenticated, company-scoped management action endpoints. */

import type { Request, Response } from 'express';
import type { SessionData } from '@libs/auth/session-store.js';
import {
  deferActionReview as deferReviewRecord,
  deleteActionRecord,
  getActionById,
  listActions as queryActions,
  listOwnerPendingReviews,
  sanitizeActionSearchQuery,
  updateActionEffectiveness,
  type ActionRow,
  type ActionScope,
  type ListActionsFilters,
  type UpdateActionInput,
} from '../database/actions.js';
import { getProjectById, isProjectMember } from '../database/project.js';
import { findUserById } from '../database/user.js';
import { createAction as createActionRecord, updateAction as updateActionRecord } from '../services/actions.service.js';
import { searchActions as querySearchActions } from '../services/action-search.service.js';
import { env } from '../config/env.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PROJECTS = 50;
const MAX_TEXT_LENGTH = 5_000;
const DEFER_WEEKS = new Set([1, 2, 4]);

type ValidActionInput = UpdateActionInput;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidDateOnly(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseActionInput(body: Record<string, unknown>): { value?: ValidActionInput; message?: string } {
  const rawProjectIds = body.projectIds;
  if (
    !Array.isArray(rawProjectIds)
    || rawProjectIds.length === 0
    || rawProjectIds.length > MAX_PROJECTS
    || !rawProjectIds.every((value) => typeof value === 'string' && /^\d+$/.test(value))
  ) {
    return { message: 'projectIds must be a non-empty array of database project ids' };
  }
  const projectIds = [...new Set(rawProjectIds as string[])];
  for (const field of ['problem', 'reason', 'actionTaken'] as const) {
    const value = body[field];
    if (!isNonEmptyString(value)) return { message: `${field} is required` };
    if (value.trim().length > MAX_TEXT_LENGTH) return { message: `${field} must be at most ${MAX_TEXT_LENGTH} characters` };
  }
  const timestamp = body.timestamp === undefined ? new Date().toISOString().slice(0, 10) : body.timestamp;
  if (typeof timestamp !== 'string' || !isValidDateOnly(timestamp)) {
    return { message: 'timestamp must be in YYYY-MM-DD format' };
  }
  return {
    value: {
      projectIds,
      problem: (body.problem as string).trim(),
      reason: (body.reason as string).trim(),
      actionTaken: (body.actionTaken as string).trim(),
      timestamp,
    },
  };
}

export function actionScopeForSession(auth: Pick<SessionData, 'companyId' | 'role' | 'userId'>): ActionScope {
  return {
    companyId: auth.companyId,
    ...(auth.role === 'member' ? { ownerUserId: auth.userId } : {}),
  };
}

function ownerScope(auth: SessionData): Required<ActionScope> {
  return { companyId: auth.companyId, ownerUserId: auth.userId };
}

async function validateProjects(auth: SessionData, projectIds: string[]): Promise<string | null> {
  for (const rawId of projectIds) {
    const projectId = Number(rawId);
    const project = await getProjectById(projectId);
    if (!project || project.company_id !== auth.companyId) return 'One or more selected projects are unavailable';
    if (auth.role === 'member' && !(await isProjectMember(auth.userId, rawId))) {
      return 'You can only log actions for projects assigned to you';
    }
  }
  return null;
}

function firstReviewAt(actionDate: string): string {
  const date = new Date(`${actionDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString();
}

export function groupEffectivenessReviews(rows: ActionRow[], now = new Date()) {
  const currentWeekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = currentWeekStart.getUTCDay();
  currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - ((day + 6) % 7));
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);

  const fromLastWeek: ActionRow[] = [];
  const earlier: ActionRow[] = [];
  const waitingForOutcome: ActionRow[] = [];
  for (const row of rows) {
    const dueAt = row.next_review_at ? new Date(row.next_review_at) : new Date(0);
    if (dueAt.getTime() > now.getTime()) {
      waitingForOutcome.push(row);
      continue;
    }
    const actionAt = new Date(`${row.action_date}T00:00:00.000Z`);
    if (actionAt >= previousWeekStart && actionAt < currentWeekStart) fromLastWeek.push(row);
    else earlier.push(row);
  }
  return {
    window_start: previousWeekStart.toISOString(),
    window_end: currentWeekStart.toISOString(),
    ready_count: fromLastWeek.length + earlier.length,
    from_last_week: fromLastWeek,
    earlier,
    waiting_for_outcome: waitingForOutcome,
  };
}

export async function createAction(request: Request, response: Response): Promise<void> {
  try {
    const parsed = parseActionInput(request.body as Record<string, unknown>);
    if (!parsed.value) {
      response.status(400).json({ message: parsed.message });
      return;
    }
    const auth = request.auth!;
    const projectError = await validateProjects(auth, parsed.value.projectIds);
    if (projectError) {
      response.status(403).json({ message: projectError });
      return;
    }
    const user = await findUserById(auth.userId);
    if (!user || user.company_id !== auth.companyId) {
      response.status(401).json({ message: 'Authentication required' });
      return;
    }
    const action = await createActionRecord({
      ...parsed.value,
      companyId: auth.companyId,
      ownerUserId: auth.userId,
      loggedBy: user.name || user.email,
      nextReviewAt: firstReviewAt(parsed.value.timestamp),
    });
    response.status(201).json(action);
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create action' });
  }
}

export async function listActions(request: Request, response: Response): Promise<void> {
  try {
    const { projectId, from, to, pending, limit, offset } = request.query;
    const filters: ListActionsFilters = actionScopeForSession(request.auth!);
    if (typeof projectId === 'string' && /^\d+$/.test(projectId)) filters.projectId = projectId;
    if (typeof from === 'string' && isValidDateOnly(from)) filters.from = from;
    if (typeof to === 'string' && isValidDateOnly(to)) filters.to = to;
    if (pending === 'true') filters.pendingOnly = true;
    if (typeof limit === 'string') {
      const parsed = Number.parseInt(limit, 10);
      if (Number.isFinite(parsed) && parsed > 0) filters.limit = Math.min(parsed, 200);
    }
    if (typeof offset === 'string') {
      const parsed = Number.parseInt(offset, 10);
      if (Number.isFinite(parsed) && parsed >= 0) filters.offset = parsed;
    }
    response.status(200).json(await queryActions(filters));
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Failed to list actions' });
  }
}

export async function searchActions(request: Request, response: Response): Promise<void> {
  try {
    const { q, limit, projectId } = request.query;
    if (typeof q !== 'string' || q.trim().length < 3 || !sanitizeActionSearchQuery(q)) {
      response.status(400).json({ message: 'Search query must contain at least 3 searchable characters' });
      return;
    }
    const parsedLimit = typeof limit === 'string'
      ? Math.min(Math.max(Number.parseInt(limit, 10) || 5, 1), env.actionSearchMaxResults)
      : 5;
    const scope = actionScopeForSession(request.auth!);
    const result = await querySearchActions({
      query: q.trim(),
      limit: parsedLimit,
      companyId: scope.companyId,
      ownerUserId: scope.ownerUserId,
      projectId: typeof projectId === 'string' && /^\d+$/.test(projectId) ? projectId : undefined,
    });
    response.setHeader('x-action-search-mode', result.mode);
    response.status(200).json(result.rows);
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Failed to search actions' });
  }
}

export async function getAction(request: Request, response: Response): Promise<void> {
  try {
    const action = await getActionById(request.params.id ?? '', actionScopeForSession(request.auth!));
    if (!action) {
      response.status(404).json({ message: 'Action not found' });
      return;
    }
    response.status(200).json(action);
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Failed to get action' });
  }
}

export async function updateAction(request: Request, response: Response): Promise<void> {
  try {
    const parsed = parseActionInput(request.body as Record<string, unknown>);
    if (!parsed.value) {
      response.status(400).json({ message: parsed.message });
      return;
    }
    const auth = request.auth!;
    const projectError = await validateProjects(auth, parsed.value.projectIds);
    if (projectError) {
      response.status(403).json({ message: projectError });
      return;
    }
    const action = await updateActionRecord(request.params.id ?? '', actionScopeForSession(auth), parsed.value);
    if (!action) {
      response.status(404).json({ message: 'Action not found' });
      return;
    }
    response.status(200).json(action);
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update action' });
  }
}

export async function deleteAction(request: Request, response: Response): Promise<void> {
  try {
    const deleted = await deleteActionRecord(request.params.id ?? '', actionScopeForSession(request.auth!));
    if (!deleted) {
      response.status(404).json({ message: 'Action not found' });
      return;
    }
    response.status(204).send();
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Failed to delete action' });
  }
}

export async function updateEffectiveness(request: Request, response: Response): Promise<void> {
  try {
    const effectiveness = (request.body as Record<string, unknown>).effectiveness;
    if (typeof effectiveness !== 'number' || !Number.isInteger(effectiveness) || effectiveness < 1 || effectiveness > 5) {
      response.status(400).json({ message: 'Effectiveness must be between 1 and 5' });
      return;
    }
    const action = await updateActionEffectiveness(request.params.id ?? '', ownerScope(request.auth!), effectiveness);
    if (!action) {
      response.status(404).json({ message: 'Only the action owner can rate this action' });
      return;
    }
    response.status(200).json(action);
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update effectiveness' });
  }
}

export async function deferActionReview(request: Request, response: Response): Promise<void> {
  try {
    const weeks = (request.body as Record<string, unknown>).weeks;
    if (typeof weeks !== 'number' || !Number.isInteger(weeks) || !DEFER_WEEKS.has(weeks)) {
      response.status(400).json({ message: 'weeks must be one of 1, 2, or 4' });
      return;
    }
    const next = new Date();
    next.setUTCDate(next.getUTCDate() + weeks * 7);
    const action = await deferReviewRecord(request.params.id ?? '', ownerScope(request.auth!), next.toISOString());
    if (!action) {
      response.status(404).json({ message: 'Only the action owner can defer this review' });
      return;
    }
    response.status(200).json(action);
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Failed to defer review' });
  }
}

export async function listEffectivenessReviews(request: Request, response: Response): Promise<void> {
  try {
    const auth = request.auth!;
    const rows = await listOwnerPendingReviews(auth.companyId, auth.userId);
    response.status(200).json(groupEffectivenessReviews(rows));
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Failed to load effectiveness reviews' });
  }
}
