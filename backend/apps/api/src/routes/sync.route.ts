/**
 * Sync Routes
 */

import { Router } from 'express';
import { enqueueSyncJob, getSyncStatus } from '../controllers/sync.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const syncRouter = Router();

/**
 * POST /api/v1/sync
 * Enqueue a new sync job
 */
syncRouter.post('/', asyncHandler(enqueueSyncJob));

/**
 * GET /api/v1/sync/:jobId
 * Get status of a sync job
 */
syncRouter.get('/:jobId', asyncHandler(getSyncStatus));
