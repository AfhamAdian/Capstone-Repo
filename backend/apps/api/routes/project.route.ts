import { Router } from 'express';
import {
  createProjectHandler,
  getProjectHandler,
  listProjectsHandler,
  listProjectsHealthHandler,
  getProjectHealthDetail,
  getProjectHealthProvenanceHandler,
  updateIntegrationHandler,
  getIntegrationTokenHandler,
} from '../controllers/project.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const projectRouter = Router();

projectRouter.get('/', requireAuth, asyncHandler(listProjectsHandler));
projectRouter.post('/', requireAuth, asyncHandler(createProjectHandler));

// Read-only project + health-score dashboard feed, scoped to the caller's company. Registered
// before '/:id' so the literal '/health' segment isn't swallowed by the :id param.
projectRouter.get('/health', requireAuth, asyncHandler(listProjectsHealthHandler));
projectRouter.get('/:projectId/health/provenance', requireAuth, asyncHandler(getProjectHealthProvenanceHandler));
projectRouter.get('/:id', requireAuth, asyncHandler(getProjectHandler));
projectRouter.patch('/:projectId/integrations', requireAuth, asyncHandler(updateIntegrationHandler));
projectRouter.get('/:projectId/integrations/:toolName/token', requireAuth, asyncHandler(getIntegrationTokenHandler));
projectRouter.get('/:projectId/health', requireAuth, asyncHandler(getProjectHealthDetail));
