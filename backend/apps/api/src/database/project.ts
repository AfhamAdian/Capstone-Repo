import type { SyncRequestPayload } from '@libs/sync/index.js';
import { assertSupabaseClient } from '../config/supabase.js';

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
}

const PROJECT_COLUMNS = 'id, company_id, name, description, created_at';

export async function createProject(input: {
  companyId: number;
  name: string;
  description?: string | null;
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

// Compensating delete for the create flow (Supabase client has no transactions).
export async function deleteProject(id: number): Promise<void> {
  const client = assertSupabaseClient();
  await client.from('project').delete().eq('id', id);
}

//TODO: Better design. Have make it work for multipurpose use.
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
    .select('*')
    .eq('id', numericProjectId)
    .single();

  if (error || !data) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const integrations: Record<string, ToolIntegration> = {};

  const jiraToken = process.env.JIRA_TOKEN ?? data.jira_token ?? data.JIRA_TOKEN;
  const jiraEmail = process.env.JIRA_EMAIL ?? data.jira_email ?? data.JIRA_EMAIL;
  const jiraBaseUrl = process.env.JIRA_BASE_URL ?? data.jira_base_url ?? data.JIRA_BASE_URL;
  const jiraProjectKey = data.jira_project_key ?? data.JIRA_PROJECT_KEY;
  const jiraBoardId = data.jira_board_id ?? data.JIRA_BOARD_ID;
  const githubToken = process.env.GITHUB_TOKEN ?? data.github_token ?? data.GITHUB_TOKEN;

  const sonarToken = data.sonar_token ?? data.SONAR_TOKEN;
  const sonarOrganization = data.sonar_organization ?? data.SONAR_ORGANIZATION;
  const sonarProjectKey = data.sonar_project_key ?? data.SONAR_PROJECT_KEY;
  const sonarBaseUrl = data.sonar_base_url ?? data.SONAR_BASE_URL;

  if (tools.includes('github')) {
    if (!data.owner || !data.repo || !githubToken) {
      throw new Error('Missing GitHub integration fields in project table: owner/repo/github_token');
    }

    integrations.github = {
      credentials: {
        token: githubToken,
      },
      project: {
        owner: data.owner,
        repo: data.repo,
      },
    };
  }

  if (tools.includes('jira')) {
    if (!jiraToken || !jiraEmail || !jiraBaseUrl || !jiraProjectKey) {
      throw new Error(
        'Missing Jira integration fields in project table: jira_token/jira_email/jira_base_url/jira_project_key',
      );
    }

    integrations.jira = {
      credentials: {
        token: jiraToken,
        email: jiraEmail,
        baseUrl: jiraBaseUrl,
      },
      project: {
        projectKey: jiraProjectKey,
        boardId: jiraBoardId ?? undefined,
      },
    };
  }

  if (tools.includes('sonarqube')) {
    if (!sonarToken || !sonarProjectKey) {
      throw new Error(
        'Missing SonarQube integration fields in project table: sonar_token/sonar_project_key',
      );
    }

    integrations.sonarqube = {
      credentials: {
        token: sonarToken,
        baseUrl: sonarBaseUrl ?? undefined,
      },
      project: {
        projectKey: sonarProjectKey,
        organization: sonarOrganization ?? undefined,
      },
    };
  }

  return integrations;
}
