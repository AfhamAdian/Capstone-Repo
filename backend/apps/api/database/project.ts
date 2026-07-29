import type { SyncRequestPayload } from '@libs/sync/index.js';
import { assertSupabaseClient } from '../config/supabase.js';

type ToolIntegration = {
  credentials?: Record<string, string | undefined>;
  project?: Record<string, string | undefined>;
};

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
  name: string;
  description: string | null;
  owner: string | null;
  repo: string | null;
  createdAt: string | null;
  pendingSurvey: boolean;
  pendingSurveyTrigger: string | null;
}

/** Every project, for the dashboard's project list. No auth/company scoping yet (see authorization.service.ts's known gaps). */
export async function listProjects(): Promise<ProjectRow[]> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('project')
    .select('id, name, description, owner, repo, created_at, pending_survey, pending_survey_trigger')
    .order('name', { ascending: true });
  if (error) {
    throw new Error(`Failed to list projects: ${error.message}`);
  }
  return (data ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    description: (p.description as string) ?? null,
    owner: (p.owner as string) ?? null,
    repo: (p.repo as string) ?? null,
    createdAt: (p.created_at as string) ?? null,
    pendingSurvey: Boolean(p.pending_survey),
    pendingSurveyTrigger: (p.pending_survey_trigger as string) ?? null,
  }));
}

export async function getProject(projectId: number): Promise<ProjectRow | null> {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('project')
    .select('id, name, description, owner, repo, created_at, pending_survey, pending_survey_trigger')
    .eq('id', projectId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load project ${projectId}: ${error.message}`);
  }
  if (!data) return null;
  return {
    id: data.id as number,
    name: data.name as string,
    description: (data.description as string) ?? null,
    owner: (data.owner as string) ?? null,
    repo: (data.repo as string) ?? null,
    createdAt: (data.created_at as string) ?? null,
    pendingSurvey: Boolean(data.pending_survey),
    pendingSurveyTrigger: (data.pending_survey_trigger as string) ?? null,
  };
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
