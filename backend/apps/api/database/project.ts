import type { SyncRequestPayload } from '@libs/sync/index.js';
import { assertSupabaseClient } from '../config/supabase.js';
import { listIntegrations } from './project-tool-integration.js';
import { getWorkspaceById } from './workspace.js';

type ToolIntegration = {
  credentials?: Record<string, string | undefined>;
  project?: Record<string, string | undefined>;
};

// Returns the project's owning company id, or null if the project does not exist.
export async function getProjectCompanyId(projectId: string): Promise<number | null> {
  const numericProjectId = Number(projectId);
  if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
    return null;
  }

  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('project')
    .select('company_id')
    .eq('id', numericProjectId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return (data.company_id as number) ?? null;
}

// True if the user is assigned to the project via a projectmember row.
export async function isProjectMember(userId: number, projectId: string): Promise<boolean> {
  const numericProjectId = Number(projectId);
  if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
    return false;
  }

  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('projectmember')
    .select('id')
    .eq('project_id', numericProjectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check project membership: ${error.message}`);
  }
  return data !== null;
}

// Core project row (tool credentials live in projecttoolintegration, not here).
export interface ProjectRecord {
  id: number;
  company_id: number;
  name: string;
  description: string | null;
  created_at: string | null;
  workspace_id: number | null;
  is_tracked: boolean;
}

const PROJECT_COLUMNS = 'id, company_id, name, description, created_at, workspace_id, is_tracked';

export async function createProject(input: {
  companyId: number;
  name: string;
  description?: string | null;
  workspaceId?: number | null;
}): Promise<ProjectRecord> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('project')
    .insert([
      {
        company_id: input.companyId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        created_at: new Date().toISOString(),
        ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
      },
    ])
    .select(PROJECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to create project: ${error?.message ?? 'no row returned'}`);
  }
  return data as ProjectRecord;
}

// Newest first; scoped to a single company.
export async function listProjectsByCompany(companyId: number): Promise<ProjectRecord[]> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('project')
    .select(PROJECT_COLUMNS)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list projects: ${error.message}`);
  }
  return (data as ProjectRecord[]) ?? [];
}

export async function getProjectById(id: number): Promise<ProjectRecord | null> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('project')
    .select(PROJECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get project: ${error.message}`);
  }
  return (data as ProjectRecord | null) ?? null;
}

// Projects in the company the user is assigned to (member view).
export async function listProjectsForMember(
  companyId: number,
  userId: number,
): Promise<ProjectRecord[]> {
  const client = assertSupabaseClient();

  const { data: memberRows, error: memberError } = await client
    .from('projectmember')
    .select('project_id')
    .eq('user_id', userId);

  if (memberError) {
    throw new Error(`Failed to list member projects: ${memberError.message}`);
  }

  const ids = (memberRows ?? []).map((row) => row.project_id as number);
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from('project')
    .select(PROJECT_COLUMNS)
    .eq('company_id', companyId)
    .in('id', ids)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list member projects: ${error.message}`);
  }
  return (data as ProjectRecord[]) ?? [];
}

// Toggle whether a project is tracked in the portfolio.
export async function setProjectTracked(id: number, tracked: boolean): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client.from('project').update({ is_tracked: tracked }).eq('id', id);
  if (error) {
    throw new Error(`Failed to update tracked flag: ${error.message}`);
  }
}

// Compensating delete for the create flow (no transactions) — clears child rows first.
export async function deleteProject(id: number): Promise<void> {
  const client = assertSupabaseClient();
  await client.from('projecttoolintegration').delete().eq('project_id', id);
  await client.from('projectmember').delete().eq('project_id', id);
  await client.from('project').delete().eq('id', id);
}

// Reads a project's tool credentials for sync: projecttoolintegration.config first, legacy project columns as fallback.
export async function getProjectIntegrationsForTools(
  projectId: string,
  tools: SyncRequestPayload['tools'],
): Promise<Record<string, ToolIntegration>> {
  const numericProjectId = Number(projectId);

  if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
    throw new Error(`Invalid projectId: ${projectId}`);
  }

  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('project')
    .select('id, workspace_id')
    .eq('id', numericProjectId)
    .single();

  if (error || !data) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Per-tool config from the generic integrations table — the single source of truth.
  // Credentials come from config only; projects created before this flow must be re-added.
  const rows = await listIntegrations(numericProjectId);
  const cfgByTool = new Map<string, Record<string, unknown>>(
    rows.map((row) => [row.tool_name, row.config ?? {}]),
  );
  const cfg = (tool: string, key: string): string | undefined => {
    const value = cfgByTool.get(tool)?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };

  // VCS token falls back to the project's workspace PAT (stored once on the workspace), so imported
  // projects don't duplicate the token in their config.
  const workspaceId = (data.workspace_id as number | null) ?? null;
  const workspaceToken = workspaceId ? (await getWorkspaceById(workspaceId))?.access_token : undefined;

  const integrations: Record<string, ToolIntegration> = {};

  if (tools.includes('github')) {
    const token = cfg('github', 'token') ?? workspaceToken;
    const owner = cfg('github', 'owner');
    const repo = cfg('github', 'repo');
    if (!token || !owner || !repo) {
      throw new Error('Missing GitHub integration fields (need token, owner, repo)');
    }
    integrations.github = { credentials: { token }, project: { owner, repo } };
  }

  if (tools.includes('gitlab')) {
    const token = cfg('gitlab', 'token') ?? workspaceToken;
    const owner = cfg('gitlab', 'owner');
    const repo = cfg('gitlab', 'repo');
    if (!token || !owner || !repo) {
      throw new Error('Missing GitLab integration fields (need token, owner, repo)');
    }
    integrations.gitlab = { credentials: { token }, project: { owner, repo } };
  }

  if (tools.includes('jira')) {
    const token = cfg('jira', 'token');
    const email = cfg('jira', 'email');
    const baseUrl = cfg('jira', 'baseUrl');
    const projectKey = cfg('jira', 'projectKey');
    const boardId = cfg('jira', 'boardId');
    if (!token || !email || !baseUrl || !projectKey) {
      throw new Error('Missing Jira integration fields (need token, email, baseUrl, projectKey)');
    }
    integrations.jira = {
      credentials: { token, email, baseUrl },
      project: { projectKey, boardId: boardId ?? undefined },
    };
  }

  if (tools.includes('sonarqube')) {
    const token = cfg('sonarqube', 'token');
    const baseUrl = cfg('sonarqube', 'baseUrl');
    const projectKey = cfg('sonarqube', 'projectKey');
    const organization = cfg('sonarqube', 'organization');
    if (!token || !projectKey) {
      throw new Error('Missing SonarQube integration fields (need token, projectKey)');
    }
    integrations.sonarqube = {
      credentials: { token, baseUrl: baseUrl ?? undefined },
      project: { projectKey, organization: organization ?? undefined },
    };
  }

  if (tools.includes('github-actions')) {
    // CI runs on the GitHub repo, so it can borrow the github config when not set explicitly.
    const token = cfg('github-actions', 'token') ?? cfg('github', 'token') ?? workspaceToken;
    const owner = cfg('github-actions', 'owner') ?? cfg('github', 'owner');
    const repo = cfg('github-actions', 'repo') ?? cfg('github', 'repo');
    if (!token || !owner || !repo) {
      throw new Error('Missing GitHub Actions integration fields (need token, owner, repo)');
    }
    integrations['github-actions'] = { credentials: { token }, project: { owner, repo } };
  }

  return integrations;
}

export async function getProjectName(projectId: number): Promise<string> {
  const client = assertSupabaseClient();
  const { data, error } = await client.from('project').select('name').eq('id', projectId).maybeSingle();
  if (error || !data) {
    throw new Error(`Project not found: ${projectId}`);
  }
  return data.name as string;
}

export interface ProjectRow {
  id: number;
  companyId: number;
  name: string;
  description: string | null;
  createdAt: string | null;
  pendingSurvey: boolean;
  pendingSurveyTrigger: string | null;
  isTracked: boolean;
}

/** Every project, for the dashboard's project list. No auth/company scoping yet (see authorization.service.ts's known gaps). */
// owner/repo intentionally omitted — they're legacy columns; the dashboard reads owner/repo from the vcs integration config.
const PROJECT_ROW_COLUMNS = 'id, company_id, name, description, created_at, pending_survey, pending_survey_trigger, is_tracked';

function toProjectRow(p: Record<string, unknown>): ProjectRow {
  return {
    id: p.id as number,
    companyId: p.company_id as number,
    name: p.name as string,
    description: (p.description as string) ?? null,
    createdAt: (p.created_at as string) ?? null,
    pendingSurvey: Boolean(p.pending_survey),
    pendingSurveyTrigger: (p.pending_survey_trigger as string) ?? null,
    isTracked: p.is_tracked !== false, // default true if column somehow missing
  };
}

// Scoped to a company when companyId is given (dashboard feed); unscoped only for internal callers.
export async function listProjects(companyId?: number): Promise<ProjectRow[]> {
  const client = assertSupabaseClient();
  let query = client.from('project').select(PROJECT_ROW_COLUMNS).order('name', { ascending: true });
  if (companyId !== undefined) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list projects: ${error.message}`);
  }
  return (data ?? []).map(toProjectRow);
}

export async function getProject(projectId: number): Promise<ProjectRow | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('project')
    .select(PROJECT_ROW_COLUMNS)
    .eq('id', projectId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load project ${projectId}: ${error.message}`);
  }
  if (!data) return null;
  return toProjectRow(data);
}

export async function setPendingSurvey(projectId: number, pending: boolean, trigger?: string): Promise<void> {
  const client = assertSupabaseClient();
  const { error } = await client
    .from('project')
    .update({ pending_survey: pending, pending_survey_trigger: pending ? (trigger ?? null) : null })
    .eq('id', projectId);
  if (error) {
    throw new Error(`Failed to update pending_survey for project ${projectId}: ${error.message}`);
  }
}

export async function getPendingSurvey(projectId: number): Promise<{ pendingSurvey: boolean; trigger: string | null }> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('project')
    .select('pending_survey, pending_survey_trigger')
    .eq('id', projectId)
    .maybeSingle();
  if (error || !data) {
    throw new Error(`Project not found: ${projectId}`);
  }
  return { pendingSurvey: Boolean(data.pending_survey), trigger: (data.pending_survey_trigger as string) ?? null };
}
