/**
 * Actions Routes
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
  createAction,
  listActions,
  getAction,
  searchActions,
  updateAction,
  deleteAction,
  updateEffectiveness,
  deferActionReview,
  listEffectivenessReviews,
} from '../controllers/actions.controller.js';

export const actionsRouter = Router();
actionsRouter.use(requireAuth);

/**
 * POST /api/v1/actions
 * Log a new management action (Level 1+)
 */
actionsRouter.post('/', asyncHandler(createAction));

/**
 * GET /api/v1/actions/search?q=...&limit=...
 * Company-scoped semantic search. Registered before /:id so "search"
 * is not captured as an id param.
 */
actionsRouter.get('/search', asyncHandler(searchActions));

/** Owner-only effectiveness queue, registered before /:id. */
actionsRouter.get('/effectiveness-review', asyncHandler(listEffectivenessReviews));

/**
 * GET /api/v1/actions?projectId=&from=&to=&pending=&limit=
 * List actions
 */
actionsRouter.get('/', asyncHandler(listActions));

/**
 * GET /api/v1/actions/:id
 * Get a single action
 */
actionsRouter.get('/:id', asyncHandler(getAction));

/** Members edit/delete their own; admins edit/delete company actions. */
actionsRouter.put('/:id', asyncHandler(updateAction));
actionsRouter.delete('/:id', asyncHandler(deleteAction));

/**
 * PUT /api/v1/actions/:id/effectiveness
 * Rate action effectiveness 1-5 (action owner only)
 */
actionsRouter.put('/:id/effectiveness', asyncHandler(updateEffectiveness));
actionsRouter.put('/:id/review-schedule', asyncHandler(deferActionReview));
