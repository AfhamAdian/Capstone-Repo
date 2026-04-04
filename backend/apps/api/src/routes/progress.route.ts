/**
 * Progress/SSE Routes
 */

import { Router } from 'express';
import { streamSyncProgress } from '../controllers/progress.controller.js';

export const progressRouter = Router();

/**
 * GET /api/v1/progress/:sessionId
 * Open SSE stream for sync progress updates
 */
progressRouter.get('/:sessionId', streamSyncProgress);
