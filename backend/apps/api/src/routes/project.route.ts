import { Router } from 'express';
import {
  createProjectHandler,
  getProjectHandler,
  listProjectsHandler,
} from '../controllers/project.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const projectRouter = Router();

projectRouter.get('/', requireAuth, asyncHandler(listProjectsHandler));
projectRouter.post('/', requireAuth, asyncHandler(createProjectHandler));
projectRouter.get('/:id', requireAuth, asyncHandler(getProjectHandler));
