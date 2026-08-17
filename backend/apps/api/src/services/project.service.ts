// Project management: list (workspace-scoped), create (admin only), and detail. Owns authorization.

import type { SessionData } from '@libs/auth/session-store.js';
import type { SupportedTool, ToolCategory } from '@libs/sync/types.js';
import {
  createProject as dbCreateProject,
  deleteProject,
  getProjectById,
  isProjectMember,
  listProjectsByCompany,
  listProjectsForMember,
  type ProjectRecord,
} from '../database/project.js';
import {
  addIntegration,
  listIntegrations,
  listIntegrationsForProjects,
  type ToolIntegrationRecord,
} from '../database/project-tool-integration.js';
import { addProjectMember, listProjectMembers } from '../database/projectmember.js';
import { findUserByEmail, findUsersByIds } from '../database/user.js';
import { sendProjectInvites } from './invite.service.js';
import { logger } from '@libs/logger.js';

const log = logger.child({ component: 'project-service' });

type Auth = SessionData & { sessionId: string };

// Thrown for expected failures so the controller can map them to 4xx.
export class ProjectError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ProjectError';
  }
}

// Valid tool names per category (from the SupportedTool provider unions) — enforces category/tool pairing.
const CATEGORY_TOOLS: Record<ToolCategory, Set<string>> = {
  vcs: new Set(['github', 'gitlab', 'bitbucket']),
  projectManagement: new Set(['jira', 'trello', 'asana']),
  cicd: new Set(['jenkins', 'circleci', 'travisci', 'github-actions']),
  codeQuality: new Set(['sonarqube', 'codeclimate', 'codacy']),
};
const VCS_PROVIDERS = CATEGORY_TOOLS.vcs;
const TOOL_CATEGORIES = new Set<ToolCategory>(['vcs', 'projectManagement', 'cicd', 'codeQuality']);

function assertToolInCategory(category: ToolCategory, toolName: string): void {
  if (!CATEGORY_TOOLS[category]?.has(toolName)) {
    throw new ProjectError(`${toolName} is not a valid ${category} tool`, 400);
  }
}
// Substrings that mark a config key as secret (matches accessToken, clientSecret, apiKey, …).
const SECRET_KEY_PATTERNS = ['token', 'secret', 'password', 'passwd', 'apikey'];

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return k === 'pass' || SECRET_KEY_PATTERNS.some((pattern) => k.includes(pattern));
}

// Config keys the sync pipeline requires per tool; unknown tools (e.g. bitbucket) are not yet validated.
const REQUIRED_CONFIG_KEYS: Partial<Record<SupportedTool, string[]>> = {
  github: ['token', 'owner', 'repo'],
  gitlab: ['token', 'owner', 'repo'],
  jira: ['token', 'email', 'baseUrl', 'projectKey'],
  sonarqube: ['token', 'projectKey'],
  'github-actions': ['token', 'owner', 'repo'],
};

// Reject at create time any tool whose config is missing the keys sync will later need.
function assertConfigForTool(toolName: SupportedTool, config: Record<string, unknown>): void {
  const required = REQUIRED_CONFIG_KEYS[toolName];
  if (!required) return;
  const missing = required.filter((key) => {
    const value = config?.[key];
    return typeof value !== 'string' || value.trim() === '';
  });
  if (missing.length > 0) {
    throw new ProjectError(`Missing config for ${toolName}: ${missing.join(', ')}`, 400);
  }
}

interface IntegrationInput {
  category: ToolCategory;
  toolName: SupportedTool;
  externalProjectId: string;
  config: Record<string, unknown>;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  vcs: { toolName: string; externalProjectId: string; config?: Record<string, unknown> };
  integrations?: IntegrationInput[];
  invites?: string[];
}

export interface ProjectListItem {
  id: number;
  name: string;
  description: string | null;
  createdAt: string | null;
  vcs: SupportedTool | null;
}

export interface ProjectDetail extends ProjectListItem {
  integrations: Array<{
    category: ToolCategory;
    toolName: SupportedTool;
    externalProjectId: string;
    config: Record<string, unknown>;
    isActive: boolean | null;
  }>;
  members: Array<{ userId: number; name: string | null; email: string | null; role: string }>;
  pendingInvites?: string[];
}

// Mask secret values so tokens never leave the server.
function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config ?? {})) {
    out[key] = isSecretKey(key) ? '***' : value;
  }
  return out;
}

async function toDetail(project: ProjectRecord, pendingInvites?: string[]): Promise<ProjectDetail> {
  const [integrations, members] = await Promise.all([
    listIntegrations(project.id),
    listProjectMembers(project.id),
  ]);
  const vcs = integrations.find((i) => i.tool_category === 'vcs')?.tool_name ?? null;

  // Enrich members with name/email so they read like the pending-invite emails, not bare ids.
  const users = await findUsersByIds(members.map((m) => m.user_id));
  const userById = new Map(users.map((u) => [u.id, u]));

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.created_at,
    vcs,
    integrations: integrations.map((i) => ({
      category: i.tool_category,
      toolName: i.tool_name,
      externalProjectId: i.external_project_id,
      config: redactConfig(i.config),
      isActive: i.is_active,
    })),
    members: members.map((m) => {
      const user = userById.get(m.user_id);
      return { userId: m.user_id, name: user?.name ?? null, email: user?.email ?? null, role: m.role };
    }),
    ...(pendingInvites ? { pendingInvites } : {}),
  };
}

// M2.1 — company projects, scoped by role, each annotated with its vcs ("workspace"); optional vcs filter.
export async function listProjects(auth: Auth, vcsFilter?: string): Promise<ProjectListItem[]> {
  const projects =
    auth.role === 'admin'
      ? await listProjectsByCompany(auth.companyId)
      : await listProjectsForMember(auth.companyId, auth.userId);

  const integrations = await listIntegrationsForProjects(projects.map((p) => p.id));
  const vcsByProject = new Map<number, SupportedTool>();
  for (const i of integrations) {
    if (i.tool_category === 'vcs') vcsByProject.set(i.project_id, i.tool_name);
  }

  return projects
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      createdAt: p.created_at,
      vcs: vcsByProject.get(p.id) ?? null,
    }))
    .filter((p) => !vcsFilter || p.vcs === vcsFilter);
}

// M2.2 — admin creates a project with its vcs (workspace), optional other tools, and member invites.
export async function createProject(auth: Auth, input: CreateProjectInput): Promise<ProjectDetail> {
  if (auth.role !== 'admin') {
    throw new ProjectError('Only admins can create projects', 403);
  }
  if (!input.name?.trim()) {
    throw new ProjectError('Project name is required', 400);
  }
  if (!input.vcs?.toolName || !VCS_PROVIDERS.has(input.vcs.toolName)) {
    throw new ProjectError('A valid version control tool (github, gitlab, bitbucket) is required', 400);
  }
  if (!input.vcs.externalProjectId?.trim()) {
    throw new ProjectError('Version control project identifier is required', 400);
  }
  assertConfigForTool(input.vcs.toolName as SupportedTool, input.vcs.config ?? {});

  // Validate every optional integration up front so a bad one never creates-then-rolls-back a project.
  for (const integration of input.integrations ?? []) {
    if (!TOOL_CATEGORIES.has(integration.category) || integration.category === 'vcs') {
      throw new ProjectError(`Invalid tool category: ${integration.category}`, 400);
    }
    if (!integration.toolName || !integration.externalProjectId?.trim()) {
      throw new ProjectError('Each integration needs a toolName and externalProjectId', 400);
    }
    assertToolInCategory(integration.category, integration.toolName);
    assertConfigForTool(integration.toolName, integration.config ?? {});
  }

  const project = await dbCreateProject({
    companyId: auth.companyId,
    name: input.name,
    description: input.description ?? null,
  });

  const pendingInvites: string[] = [];

  try {
    // Version control — the workspace; always exactly one.
    await addIntegration({
      projectId: project.id,
      category: 'vcs',
      toolName: input.vcs.toolName as SupportedTool,
      externalProjectId: input.vcs.externalProjectId,
      config: input.vcs.config ?? {},
    });

    // Other-category tools — optional (already validated above).
    for (const integration of input.integrations ?? []) {
      await addIntegration({
        projectId: project.id,
        category: integration.category,
        toolName: integration.toolName,
        externalProjectId: integration.externalProjectId,
        config: integration.config ?? {},
      });
    }

    // Invites: assign existing company members now; unknown emails get an email invite below.
    // Dedupe emails and track added users so a repeated invitee can't hit the unique constraint.
    const seenEmails = new Set<string>();
    const addedUserIds = new Set<number>();
    for (const rawEmail of input.invites ?? []) {
      const email = rawEmail?.trim().toLowerCase();
      if (!email || seenEmails.has(email)) continue;
      seenEmails.add(email);
      const user = await findUserByEmail(email);
      if (user && user.company_id === auth.companyId) {
        if (!addedUserIds.has(user.id)) {
          await addProjectMember({ projectId: project.id, userId: user.id });
          addedUserIds.add(user.id);
        }
      } else {
        pendingInvites.push(email);
      }
    }
  } catch (error) {
    await deleteProject(project.id);
    log.error({ err: error, projectId: project.id }, 'project creation failed, rolled back');
    throw error;
  }

  // Project committed — email the unknown invitees a registration link (best-effort).
  if (pendingInvites.length > 0) {
    await sendProjectInvites({
      companyId: auth.companyId,
      projectId: project.id,
      projectName: project.name,
      emails: pendingInvites,
    });
  }

  log.info({ projectId: project.id, companyId: auth.companyId }, 'project created');
  return toDetail(project, pendingInvites);
}

// M2.3 — project detail, authorized (company match; non-admins must be assigned).
export async function getProject(auth: Auth, projectId: number): Promise<ProjectDetail> {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new ProjectError('Project not found', 404);
  }
  if (project.company_id !== auth.companyId) {
    throw new ProjectError('You do not have access to this project', 403);
  }
  if (auth.role !== 'admin' && !(await isProjectMember(auth.userId, String(projectId)))) {
    throw new ProjectError('You are not assigned to this project', 403);
  }
  return toDetail(project);
}
