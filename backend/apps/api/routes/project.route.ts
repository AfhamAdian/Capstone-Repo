import { Router } from 'express';
import {
  createProjectHandler,
  getProjectHandler,
  listProjectsHandler,
  listProjectsHealthHandler,
  getProjectHealthDetail,
} from '../controllers/project.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const projectRouter = Router();

projectRouter.get('/', requireAuth, asyncHandler(listProjectsHandler));
projectRouter.post('/', requireAuth, asyncHandler(createProjectHandler));

// Read-only project + health-score dashboard feed (no auth scoping yet). Registered
// before '/:id' so the literal '/health' segment isn't swallowed by the :id param.
projectRouter.get('/health', asyncHandler(listProjectsHealthHandler));
projectRouter.get('/:id', requireAuth, asyncHandler(getProjectHandler));
projectRouter.get('/:projectId/health', asyncHandler(getProjectHealthDetail));
