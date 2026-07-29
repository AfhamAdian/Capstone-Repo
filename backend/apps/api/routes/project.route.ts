/**
 * Project Routes (mounted at /api/v1/projects)
 */

import { Router } from 'express';
import { listProjects, getProjectHealthDetail } from '../controllers/project.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const projectRouter = Router();

/** GET /api/v1/projects */
projectRouter.get('/', asyncHandler(listProjects));

/** GET /api/v1/projects/:projectId/health */
projectRouter.get('/:projectId/health', asyncHandler(getProjectHealthDetail));
