/**
 * Project Controller
 * Read-only project + health-score endpoints for the dashboard. No auth
 * scoping yet (matches the rest of this backend - see authorization.service.ts).
 */

import type { Request, Response } from 'express';
import { listProjectsWithHealth, getProjectHealth } from '../services/project.service.js';

/** GET /api/v1/projects */
export async function listProjects(_request: Request, response: Response): Promise<void> {
  try {
    const projects = await listProjectsWithHealth();
    response.status(200).json({ projects });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list projects';
    response.status(500).json({ message });
  }
}

/** GET /api/v1/projects/:projectId/health */
export async function getProjectHealthDetail(request: Request, response: Response): Promise<void> {
  const projectId = Number(request.params.projectId);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    response.status(400).json({ message: 'projectId must be a positive number' });
    return;
  }

  try {
    const health = await getProjectHealth(projectId);
    if (!health) {
      response.status(404).json({ message: 'Project not found' });
      return;
    }
    response.status(200).json(health);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load project health';
    response.status(500).json({ message });
  }
}
