// HTTP handlers for projects: parses requests and maps ProjectError to status codes.
// Also serves the read-only project + health-score dashboard feed.

import type { Request, Response } from 'express';
import {
  ProjectError,
  createProject,
  getProject,
  listProjects,
  listProjectsWithHealth,
  getProjectHealth,
  updateProjectIntegration,
} from '../services/project.service.js';
import { getProjectHealthProvenance } from '../services/health-provenance.service.js';

function handleProjectError(error: unknown, response: Response): void {
  if (error instanceof ProjectError) {
    response.status(error.status).json({ message: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : 'Request failed';
  response.status(500).json({ message });
}

// GET /api/v1/projects?vcs=github
export async function listProjectsHandler(request: Request, response: Response): Promise<void> {
  try {
    const vcs = typeof request.query.vcs === 'string' ? request.query.vcs : undefined;
    const projects = await listProjects(request.auth!, vcs);
    response.status(200).json({ projects });
  } catch (error) {
    handleProjectError(error, response);
  }
}

// POST /api/v1/projects
export async function createProjectHandler(request: Request, response: Response): Promise<void> {
  try {
    const project = await createProject(request.auth!, request.body ?? {});
    response.status(201).json({ project });
  } catch (error) {
    handleProjectError(error, response);
  }
}

// PATCH /api/v1/projects/:projectId/integrations — update a connector's config (admin only).
export async function updateIntegrationHandler(request: Request, response: Response): Promise<void> {
  try {
    const projectId = Number(request.params.projectId);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      response.status(400).json({ message: 'Invalid project id' });
      return;
    }
    const { toolName, config } = request.body ?? {};
    if (!toolName || typeof toolName !== 'string') {
      response.status(400).json({ message: 'toolName is required' });
      return;
    }
    const project = await updateProjectIntegration(request.auth!, projectId, toolName, config ?? {});
    response.status(200).json({ project });
  } catch (error) {
    handleProjectError(error, response);
  }
}

// GET /api/v1/projects/:id
export async function getProjectHandler(request: Request, response: Response): Promise<void> {
  try {
    const projectId = Number(request.params.id);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      response.status(400).json({ message: 'Invalid project id' });
      return;
    }
    const project = await getProject(request.auth!, projectId);
    response.status(200).json({ project });
  } catch (error) {
    handleProjectError(error, response);
  }
}

/** Project + health-score dashboard feed, scoped to the caller's company. */

/** GET /api/v1/projects/health */
export async function listProjectsHealthHandler(request: Request, response: Response): Promise<void> {
  try {
    const projects = await listProjectsWithHealth(request.auth!);
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
    const health = await getProjectHealth(request.auth!, projectId);
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

/** GET /api/v1/projects/:projectId/health/provenance */
export async function getProjectHealthProvenanceHandler(request: Request, response: Response): Promise<void> {
  const projectId = Number(request.params.projectId);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    response.status(400).json({ message: 'projectId must be a positive number' });
    return;
  }

  try {
    const provenance = await getProjectHealthProvenance(projectId);
    if (!provenance) {
      response.status(404).json({ message: 'No health score to explain yet' });
      return;
    }
    response.status(200).json(provenance);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load score provenance';
    response.status(500).json({ message });
  }
}
