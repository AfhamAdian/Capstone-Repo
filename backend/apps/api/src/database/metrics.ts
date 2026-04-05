import { assertSupabaseClient } from '../config/supabase.js';
import type { GitHubMetricsResponse } from '../../../../libs/connectors/vcs/github-metrics.types.js';
import type { JiraMetricsResponse } from '../../../../libs/connectors/pm/jira-metrics.types.js';

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

  const { metrics } = data;

  const { error } = await client
    .from('versioncontrolmetrics')
    .insert([
      {
        snapshot_id: snapshotId,
        issues_closed_per_week: metrics.issuesClosedPerWeek,
        issue_cycle_time_avg_days: metrics.issueCycleTimeAvgDays,
        pr_review_coverage_percent: metrics.prReviewCoveragePercent,
        review_per_pr_avg: metrics.reviewPerPrAvg,
        self_merged_pr_rate_percent: metrics.selfMergedPrRatePercent,
        time_to_first_review_avg_hours: metrics.timeToFirstReviewAvgHours,
        files_modified_gte_10_times: metrics.codeChurn.filesModifiedGte10Times,
        files_modified_by_gte_3_people: metrics.codeChurn.filesModifiedByGte3People,
        commit_with_issue_ref_percent: metrics.commitMessageQuality.withIssueRefPercent,
        commit_with_body_percent: metrics.commitMessageQuality.withBodyPercent,
        commit_following_convention_percent: metrics.commitMessageQuality.followingConventionPercent,
        stale_pr_count: metrics.stalePrCount,
        long_lived_branches_count: metrics.longLivedBranchesCount,
        pr_revert_rate_percent: metrics.prRevertRatePercent,
        bus_factor: metrics.busFactor,
        active_contributions_per_week: metrics.activeContributionsPerWeek,
        review_network_density: metrics.reviewNetworkDensity,
        dependency_update_lag_avg_days: metrics.dependencyUpdateLagAvgDays,
      },
    ]);

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
  const { metrics } = data;

  const { error } = await client
    .from('projectmanagementmetrics')
    .insert([
      {
        snapshot_id: snapshotId,
        sprint_completion_rate: metrics.sprintCompletionRate,
        issue_cycle_time_avg_days: metrics.issueCycleTimeAvgDays,
        throughput_per_week: metrics.throughputPerWeek,
        carryover_rate: metrics.carryoverRate,
        scope_creep_rate: metrics.scopeCreepRate,
        estimation_accuracy: metrics.estimationAccuracy,
        blocked_items_count: metrics.blockedItemsCount,
        blocked_items_avg_age_days: metrics.blockedItemsAvgAgeDays,
        overdue_items_count: metrics.overdueItemsCount,
        lead_time_avg_days: metrics.leadTime.avgDays,
        lead_time_median_days: metrics.leadTime.medianDays,
        lead_time_p95_days: metrics.leadTime.p95Days,
        lead_time_variance: metrics.leadTime.variance,
        spillover_ratio: metrics.spillover.spilloverRatio,
        story_point_spillover: metrics.spillover.storyPointSpillover,
        consecutive_spillover_count: metrics.spillover.consecutiveSpilloverCount,
        carryover_avg_age_days: metrics.spillover.carryoverAvgAgeDays,
        blocked_ticket_percent: metrics.blockedWork.blockedTicketPercent,
        avg_blocked_duration_days: metrics.blockedWork.avgBlockedDurationDays,
        max_blocked_duration_days: metrics.blockedWork.maxBlockedDurationDays,
        blocked_reentry_count: metrics.blockedWork.blockedReentryCount,
        mid_sprint_additions: metrics.scopeChurn.midSprintAdditions,
        scope_churn_ratio: metrics.scopeChurn.scopeChurnRatio,
        priority_change_count: metrics.scopeChurn.priorityChangeCount,
        removed_scope_ratio: metrics.scopeChurn.removedScopeRatio,
        in_progress_avg_age_days: metrics.staleTickets.inProgressAvgAgeDays,
        stale_ticket_ratio: metrics.staleTickets.staleTicketRatio,
        state_movement_count: metrics.staleTickets.stateMovementCount,
      },
    ]);

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

export async function persistConnectorMetrics(input: {
  projectId: number;
  tool: string;
  data: unknown;
}): Promise<void> {
  const snapshotTime = new Date().toISOString();
  const snapshotId = await createProjectSnapshot(input.projectId, snapshotTime);

  if (input.tool === 'github') {
    if (!isGitHubMetricsResponse(input.data)) {
      throw new Error('Invalid GitHub metrics payload received from connector');
    }

    await insertVersionControlMetrics(snapshotId, input.data);
    await insertCodeOwnershipConcentration(snapshotId, input.data);
    return;
  }

  if (input.tool === 'jira') {
    if (!isJiraMetricsResponse(input.data)) {
      throw new Error('Invalid Jira metrics payload received from connector');
    }

    await insertProjectManagementMetrics(snapshotId, input.data);
    await insertLeadTimeTrend(snapshotId, input.data);
    return;
  }

  throw new Error(`Unsupported tool for metric persistence: ${input.tool}`);
}
