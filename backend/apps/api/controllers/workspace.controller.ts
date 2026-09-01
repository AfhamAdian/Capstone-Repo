// HTTP handlers for workspaces: preview a PAT's repos, create a workspace + import projects, list workspaces.

import type { Request, Response } from 'express';
import {
  WorkspaceError,
  previewRepos,
  createWorkspace,
  listWorkspaces,
  listWorkspaceRepos,
  addWorkspaceProjects,
} from '../services/workspace.service.js';

function handleWorkspaceError(error: unknown, response: Response): void {
  if (error instanceof WorkspaceError) {
    response.status(error.status).json({ message: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : 'Request failed';
  response.status(500).json({ message });
}

// POST /api/v1/workspaces/preview-repos — validate a PAT and return the repos it can access (saves nothing).
export async function previewReposHandler(request: Request, response: Response): Promise<void> {
  try {
    const { vcs, organization, token } = request.body ?? {};
    const repos = await previewRepos(request.auth!, { vcs, organization, token });
    response.status(200).json({ repos });
  } catch (error) {
    handleWorkspaceError(error, response);
  }
}

// POST /api/v1/workspaces — create a workspace and import the selected repos as projects (admin only).
export async function createWorkspaceHandler(request: Request, response: Response): Promise<void> {
  try {
    const { name, vcs, organization, token, repos } = request.body ?? {};
    const result = await createWorkspace(request.auth!, { name, vcs, organization, token, repos });
    response.status(201).json(result);
  } catch (error) {
    handleWorkspaceError(error, response);
  }
}

// GET /api/v1/workspaces — the caller's company workspaces.
export async function listWorkspacesHandler(request: Request, response: Response): Promise<void> {
  try {
    const workspaces = await listWorkspaces(request.auth!);
    response.status(200).json({ workspaces });
  } catch (error) {
    handleWorkspaceError(error, response);
  }
}

// GET /api/v1/workspaces/:workspaceId/repos — repos reachable by this workspace's PAT (admin only).
export async function listWorkspaceReposHandler(request: Request, response: Response): Promise<void> {
  try {
    const workspaceId = Number(request.params.workspaceId);
    if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
      response.status(400).json({ message: 'Invalid workspace id' });
      return;
    }
    const repos = await listWorkspaceRepos(request.auth!, workspaceId);
    response.status(200).json({ repos });
  } catch (error) {
    handleWorkspaceError(error, response);
  }
}

// POST /api/v1/workspaces/:workspaceId/projects — import selected repos as projects (admin only).
export async function addWorkspaceProjectsHandler(request: Request, response: Response): Promise<void> {
  try {
    const workspaceId = Number(request.params.workspaceId);
    if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
      response.status(400).json({ message: 'Invalid workspace id' });
      return;
    }
    const { repos } = request.body ?? {};
    const result = await addWorkspaceProjects(request.auth!, workspaceId, repos);
    response.status(201).json(result);
  } catch (error) {
    handleWorkspaceError(error, response);
  }
}
