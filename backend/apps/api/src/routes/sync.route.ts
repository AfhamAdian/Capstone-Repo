/**
 * Sync Routes
 */

import { Router } from 'express';
import { enqueueSyncJob, getSyncStatus } from '../controllers/sync.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const syncRouter = Router();

// POST /api/v1/sync — enqueue a new sync job
syncRouter.post('/', requireAuth, asyncHandler(enqueueSyncJob));

// GET /api/v1/sync/:jobId — get status of a sync job
syncRouter.get('/:jobId', requireAuth, asyncHandler(getSyncStatus));
