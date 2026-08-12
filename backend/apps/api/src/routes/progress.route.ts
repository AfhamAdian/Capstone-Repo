/**
 * Progress/SSE Routes
 */

import { Router } from 'express';
import { streamSyncProgress } from '../controllers/progress.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export const progressRouter = Router();

// GET /api/v1/progress/:sessionId — open SSE stream for sync progress updates
progressRouter.get('/:sessionId', requireAuth, streamSyncProgress);
