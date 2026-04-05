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

  const jiraToken = data.jira_token ?? data.JIRA_TOKEN;
  const jiraEmail = data.jira_email ?? data.JIRA_EMAIL;
  const jiraBaseUrl = data.jira_base_url ?? data.JIRA_BASE_URL;
  const jiraProjectKey = data.jira_project_key ?? data.JIRA_PROJECT_KEY;
  const jiraBoardId = data.jira_board_id ?? data.JIRA_BOARD_ID;
  const githubToken = data.github_token ?? data.GITHUB_TOKEN;

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

  return integrations;
}
