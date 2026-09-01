import { Router } from 'express';
import {
  previewReposHandler,
  createWorkspaceHandler,
  listWorkspacesHandler,
  listWorkspaceReposHandler,
  addWorkspaceProjectsHandler,
} from '../controllers/workspace.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const workspaceRouter = Router();

workspaceRouter.get('/', requireAuth, asyncHandler(listWorkspacesHandler));
workspaceRouter.post('/', requireAuth, asyncHandler(createWorkspaceHandler));
workspaceRouter.post('/preview-repos', requireAuth, asyncHandler(previewReposHandler));
workspaceRouter.get('/:workspaceId/repos', requireAuth, asyncHandler(listWorkspaceReposHandler));
workspaceRouter.post('/:workspaceId/projects', requireAuth, asyncHandler(addWorkspaceProjectsHandler));
