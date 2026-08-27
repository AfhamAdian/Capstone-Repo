import { assertSupabaseClient } from '../config/supabase.js';
import type { GitHubMetricsResponse } from '../../../libs/connectors/vcs/github-metrics.types.js';
import type { JiraMetricsResponse } from '../../../libs/connectors/pm/jira-metrics.types.js';
import type { SonarQubeMetricsResponse } from '../../../libs/connectors/quality/sonarqube-metrics.types.js';
import type { GithubActionsMetricsResponse } from '../../../libs/connectors/cicd/GithubActionsConnector/github-actions.types.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGitHubMetricsResponse(data: unknown): data is GitHubMetricsResponse {
  if (!isObject(data)) return false;
  if (!isObject(data.repo) || !isObject(data.metrics)) return false;

  return typeof data.generatedAt === 'string'
    && typeof data.repo.owner === 'string'
    && typeof data.repo.repo === 'string';
}

function isJiraMetricsResponse(data: unknown): data is JiraMetricsResponse {
  if (!isObject(data)) return false;
  if (!isObject(data.project) || !isObject(data.metrics)) return false;
  return typeof data.generatedAt === 'string' && typeof data.project.key === 'string';
}

function isSonarQubeMetricsResponse(data: unknown): data is SonarQubeMetricsResponse {
  if (!isObject(data)) return false;
  if (!isObject(data.project) || !isObject(data.metrics)) return false;
  return typeof data.generatedAt === 'string' && typeof data.project.projectKey === 'string';
}

function isGithubActionsMetricsResponse(data: unknown): data is GithubActionsMetricsResponse {
  if (!isObject(data)) return false;
  if (!isObject(data.repo) || !isObject(data.metrics)) return false;
  return typeof data.generatedAt === 'string';
}

async function createProjectSnapshot(projectId: number, snapshotTime: string): Promise<number> {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('projectsnapshot')
    .insert([
      {
        project_id: projectId,
        snapshot_time: snapshotTime,
        created_at: new Date().toISOString(),
      },
    ])
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create project snapshot: ${error?.message ?? 'No snapshot row returned'}`);
  }

  return data.id as number;
}

async function insertVersionControlMetrics(snapshotId: number, data: GitHubMetricsResponse): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client
    .from('versioncontrolmetrics')
    .insert([{ snapshot_id: snapshotId, metrics: data.metrics }]);

  if (error) {
    throw new Error(`Failed to save version control metrics: ${error.message}`);
  }
}

async function insertCodeOwnershipConcentration(snapshotId: number, data: GitHubMetricsResponse): Promise<void> {
  const client = assertSupabaseClient();
  const directories = data.metrics.codeOwnershipConcentration.directories;

  if (!directories.length) {
    return;
  }

  const rows = directories.map((directory) => ({
    snapshot_id: snapshotId,
    path: directory.path,
    top_contributor_percent: directory.topContributorPercent,
    is_flagged: directory.isFlagged,
  }));

  const { error } = await client
    .from('codeownershipconcentration')
    .insert(rows);

  if (error) {
    throw new Error(`Failed to save code ownership concentration: ${error.message}`);
  }
}

async function insertProjectManagementMetrics(snapshotId: number, data: JiraMetricsResponse): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client
    .from('projectmanagementmetrics')
    .insert([{ snapshot_id: snapshotId, metrics: data.metrics }]);

  if (error) {
    throw new Error(`Failed to save project management metrics: ${error.message}`);
  }
}

async function insertLeadTimeTrend(snapshotId: number, data: JiraMetricsResponse): Promise<void> {
  const client = assertSupabaseClient();
  const trends = data.metrics.leadTime.trendAcrossSprints;

  if (!trends.length) {
    return;
  }

  const rows = trends.map((trend) => ({
    snapshot_id: snapshotId,
    sprint_name: trend.sprintName,
    avg_lead_time_days: trend.avgLeadTimeDays,
  }));

  const { error } = await client
    .from('leadtimetrend')
    .insert(rows);

  if (error) {
    throw new Error(`Failed to save lead time trend: ${error.message}`);
  }
}

async function insertCodeQualityMetrics(snapshotId: number, data: SonarQubeMetricsResponse): Promise<void> {
  for (let i = 0; i < 3; i++) {
    try {
      return await insertCodeQualityMetrics_impl(snapshotId, data);
    } catch (e: any) {
      if (i === 2 || !e.message?.includes('fetch failed')) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error("Unreachable");
}

async function insertCodeQualityMetrics_impl(snapshotId: number, data: SonarQubeMetricsResponse): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client
    .from('codequalitymetrics')
    .insert([{ snapshot_id: snapshotId, metrics: data.metrics }]);

  if (error) {
    throw new Error(`Failed to save code quality metrics: ${error.message}`);
  }
}

async function insertCicdMetrics(snapshotId: number, data: GithubActionsMetricsResponse): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client
    .from('cicdmetrics')
    .insert([{ snapshot_id: snapshotId, metrics: data.metrics }]);

  if (error) {
    throw new Error(`Failed to save CI/CD metrics: ${error.message}`);
  }
}

export async function persistConnectorMetrics(input: {
  projectId: number;
  tool: string;
  data: unknown;
  snapshotId?: number;
}): Promise<number> {
  let attempt = 0;
  while (attempt < 3) {
    try {
      return await persistConnectorMetricsImpl(input);
    } catch (error: any) {
      attempt++;
      if (attempt === 3 || !error.message?.includes('fetch failed')) {
        throw error;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('Unreachable');
}

async function persistConnectorMetricsImpl(input: {
  projectId: number;
  tool: string;
  data: unknown;
  snapshotId?: number;
}): Promise<number> {
  let snapshotId = input.snapshotId;

  if (!snapshotId) {
    const snapshotTime = new Date().toISOString();
    snapshotId = await createProjectSnapshot(input.projectId, snapshotTime);
  }

  if (input.tool === 'github') {
    if (!isGitHubMetricsResponse(input.data)) {
      throw new Error('Invalid GitHub metrics payload received from connector');
    }

    await insertVersionControlMetrics(snapshotId, input.data);
    await insertCodeOwnershipConcentration(snapshotId, input.data);
    return snapshotId;
  }

  if (input.tool === 'jira') {
    if (!isJiraMetricsResponse(input.data)) {
      throw new Error('Invalid Jira metrics payload received from connector');
    }

    await insertProjectManagementMetrics(snapshotId, input.data);
    await insertLeadTimeTrend(snapshotId, input.data);
    return snapshotId;
  }

  if (input.tool === 'sonarqube') {
    if (!isSonarQubeMetricsResponse(input.data)) {
      throw new Error('Invalid SonarQube metrics payload received from connector');
    }

    await insertCodeQualityMetrics(snapshotId, input.data);
    return snapshotId;
  }

  if (input.tool === 'github-actions') {
    if (!isGithubActionsMetricsResponse(input.data)) {
      throw new Error('Invalid GitHub Actions metrics payload received from connector');
    }

    await insertCicdMetrics(snapshotId, input.data);
    return snapshotId;
  }

  throw new Error(`Unsupported tool for metric persistence: ${input.tool}`);
}
