// HTTP handlers for projects: parses requests and maps ProjectError to status codes.

import type { Request, Response } from 'express';
import { ProjectError, createProject, getProject, listProjects } from '../services/project.service.js';

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
