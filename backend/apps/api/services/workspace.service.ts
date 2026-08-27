// Workspace management: preview the repos a PAT can access, then create a workspace and import
// the selected repos as projects. The PAT is stored once on the workspace (source of truth);
// for now it is also copied into each imported project's vcs config so the existing sync pipeline
// works unchanged (this copy is removed once project.workspace_id + workspace-token resolution land).

import type { SessionData } from '@libs/auth/session-store.js';
import type { SupportedTool } from '@libs/sync/types.js';
import { listAccessibleRepos, VcsError, type RepoSummary } from '@libs/connectors/vcs/repo-lister.js';
import {
  createWorkspace as dbCreateWorkspace,
  deleteWorkspace as dbDeleteWorkspace,
  listWorkspacesByCompany,
  type WorkspaceRecord,
} from '../database/workspace.js';
import { createProject as dbCreateProject, deleteProject as dbDeleteProject } from '../database/project.js';
import { addIntegration } from '../database/project-tool-integration.js';
import { logger } from '@libs/logger.js';

const log = logger.child({ component: 'workspace-service' });

type Auth = SessionData & { sessionId: string };

// Thrown for expected failures so the controller can map them to a 4xx.
export class WorkspaceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

const SUPPORTED_VCS = new Set(['github', 'gitlab', 'bitbucket']);

export interface WorkspaceView {
  id: number;
  name: string;
  vcsProvider: string;
  organization: string;
  createdAt: string | null;
}

// Never expose the stored PAT to the client.
function toView(w: WorkspaceRecord): WorkspaceView {
  return {
    id: w.id,
    name: w.name,
    vcsProvider: w.vcs_provider,
    organization: w.organization,
    createdAt: w.created_at,
  };
}

// Step 2 of the wizard: validate the PAT and return the repos it can access under the org. Saves nothing.
// Admin-only, since only admins create workspaces.
export async function previewRepos(
  auth: Auth,
  input: { vcs: string; organization: string; token: string },
): Promise<RepoSummary[]> {
  if (auth.role !== 'admin') {
    throw new WorkspaceError('Only admins can create workspaces', 403);
  }
  if (!SUPPORTED_VCS.has(input.vcs)) {
    throw new WorkspaceError('A valid version control provider (github, gitlab, bitbucket) is required', 400);
  }
  try {
    return await listAccessibleRepos(input.vcs, input.organization, input.token);
  } catch (error) {
    if (error instanceof VcsError) throw new WorkspaceError(error.message, error.status);
    throw error;
  }
}

// Step 3 of the wizard: create the workspace and import the selected repos as projects.
export async function createWorkspace(
  auth: Auth,
  input: { name: string; vcs: string; organization: string; token: string; repos: string[] },
): Promise<{ workspace: WorkspaceView; projects: Array<{ id: number; name: string }> }> {
  if (auth.role !== 'admin') {
    throw new WorkspaceError('Only admins can create workspaces', 403);
  }
  if (!input.name?.trim()) throw new WorkspaceError('Workspace name is required', 400);
  if (!SUPPORTED_VCS.has(input.vcs)) {
    throw new WorkspaceError('A valid version control provider is required', 400);
  }
  if (!input.organization?.trim()) throw new WorkspaceError('Organization/owner is required', 400);
  if (!input.token?.trim()) throw new WorkspaceError('An access token is required', 400);
  if (!Array.isArray(input.repos) || input.repos.length === 0) {
    throw new WorkspaceError('Select at least one repository to track', 400);
  }

  // Re-fetch so we only import repos the token can actually reach (and get their descriptions).
  let accessible: RepoSummary[];
  try {
    accessible = await listAccessibleRepos(input.vcs, input.organization, input.token);
  } catch (error) {
    if (error instanceof VcsError) throw new WorkspaceError(error.message, error.status);
    throw error;
  }
  const byName = new Map(accessible.map((r) => [r.name, r]));
  // Dedupe so the same repo selected twice can't create duplicate projects.
  const selected = [...new Set(input.repos)].filter((name) => byName.has(name));
  if (selected.length === 0) {
    throw new WorkspaceError('None of the selected repositories are accessible with this token', 400);
  }

  const workspace = await dbCreateWorkspace({
    companyId: auth.companyId,
    name: input.name,
    vcsProvider: input.vcs,
    organization: input.organization,
    accessToken: input.token,
  });

  const createdProjectIds: number[] = [];
  try {
    const projects: Array<{ id: number; name: string }> = [];
    for (const repoName of selected) {
      const repo = byName.get(repoName)!;
      const project = await dbCreateProject({
        companyId: auth.companyId,
        name: repoName,
        description: repo.description,
        workspaceId: workspace.id,
      });
      createdProjectIds.push(project.id);
      await addIntegration({
        projectId: project.id,
        category: 'vcs',
        toolName: input.vcs as SupportedTool,
        // No token here — sync resolves it from the workspace PAT via project.workspace_id.
        config: { owner: input.organization, repo: repoName },
      });
      projects.push({ id: project.id, name: repoName });
    }

    log.info({ workspaceId: workspace.id, companyId: auth.companyId, projects: projects.length }, 'workspace created');
    return { workspace: toView(workspace), projects };
  } catch (error) {
    // Compensating cleanup — no transactions, so undo the partial import by hand.
    for (const id of createdProjectIds) {
      await dbDeleteProject(id).catch(() => {});
    }
    await dbDeleteWorkspace(workspace.id).catch(() => {});
    log.error({ err: error, workspaceId: workspace.id }, 'workspace import failed, rolled back');
    throw error;
  }
}

export async function listWorkspaces(auth: Auth): Promise<WorkspaceView[]> {
  const rows = await listWorkspacesByCompany(auth.companyId);
  return rows.map(toView);
}
