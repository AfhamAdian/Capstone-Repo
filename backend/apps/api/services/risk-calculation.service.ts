/**
 * Risk Calculation Service
 * Calculates risk scores based on collected metrics and saves them to the database
 */

import { RiskEngine } from '@libs/risk-engines/risk-engine.js';
import {
  RiskType,
  type SecurityMetrics,
  type ReliabilityMetrics,
  type MaintainabilityMetrics,
  type CicdDeploymentHealthMetrics,
  type TeamHealthMetrics,
  type EngineeringProcessMetrics,
  type PlanningExecutionMetrics,
} from '@libs/risk-engines/types.js';
import { saveAllRiskScores } from '../database/risk-score.js';
import { assertSupabaseClient } from '../config/supabase.js';
import { logger } from '@libs/logger.js';
import type { GitHubMetricsResponse } from '../../../libs/connectors/vcs/github-metrics.types.js';
import type { JiraMetricsResponse } from '../../../libs/connectors/pm/jira-metrics.types.js';
import type { SonarQubeMetricsResponse } from '../../../libs/connectors/quality/sonarqube-metrics.types.js';
import type { GithubActionsMetricsResponse } from '../../../libs/connectors/cicd/GithubActionsConnector/github-actions.types.js';

const log = logger.child({ component: 'risk-calculation-service' });

function roundRiskScore(score: number | null): number | null {
  return typeof score === 'number' ? Math.round(score) : null;
}

/**
 * Calculate and save all 7 health scores for a project snapshot.
 *
 * Metrics are read as-is from each tool's stored `metrics` jsonb column - same
 * camelCase shape the connector produced (see backend/libs/connectors/*).
 * Any table with no row for this snapshot (that tool wasn't part of this sync,
 * or hasn't been synced yet) resolves to `null` and its fields simply come
 * through as `undefined` below; RiskEngine's null-aware weighting handles the
 * rest (see backend/libs/risk-engines/risk-engines-reference.md).
 */
export async function calculateAndSaveRiskScores(projectSnapshotId: number): Promise<Record<string, number | null>> {
  const startedAt = Date.now();

  try {
    log.info({ projectSnapshotId }, 'starting risk score calculation');

    const metrics = await fetchMetricsForSnapshot(projectSnapshotId);
    const { versionControl: vcs, projectManagement: jira, codeQuality: sonar, cicd, codeOwnershipConcentrationPercent } = metrics;

    const riskEngine = new RiskEngine();
    const scores: Record<string, number | null> = {};

    // Source-preference resolution (Jira primary / VCS fallback), same rule
    // documented in risk-engines/types.ts and applied in test-risk-scores.ts.
    const issueCycleTimeDays = jira?.issueCycleTimeAvgDays ?? vcs?.issueCycleTimeAvgDays ?? undefined;
    const throughputPerWeek = jira?.throughputPerWeek ?? vcs?.issuesClosedPerWeek;

    const commitMessageQualityPercent =
      vcs?.commitMessageQuality.followingConventionPercent ??
      (vcs ? (vcs.commitMessageQuality.withBodyPercent + vcs.commitMessageQuality.withIssueRefPercent) / 2 : undefined);

    // 1. Security
    const securityMetrics: SecurityMetrics = {
      securityVulnerabilityCount: vcs?.securityVulnerabilityCount ?? undefined,
      linesOfCode: sonar?.linesOfCode ?? undefined,
      dependencyUpdateLagDays: vcs?.dependencyUpdateLagAvgDays ?? undefined,
      securityRating: sonar?.securityRating ?? undefined,
      securityHotspots: sonar?.securityHotspots ?? undefined,
      securityReviewRating: sonar?.securityReviewRating ?? undefined,
      securityRemediationEffort: sonar?.securityRemediationEffort ?? undefined,
      newVulnerabilities: sonar?.newVulnerabilities ?? undefined,
    };
    const securityResult = riskEngine.calculateRisk(RiskType.SECURITY, securityMetrics);
    scores[RiskType.SECURITY] = roundRiskScore(securityResult.score);
    log.info({ score: securityResult.score, level: securityResult.level }, 'calculated security score');

    // 2. Reliability
    const reliabilityMetrics: ReliabilityMetrics = {
      issueReopenRatePercent: vcs?.issueReopenRatePercent ?? undefined,
      mrRevertRatePercent: vcs?.prRevertRatePercent,
      flakyTestCount: cicd?.flakyTestCount ?? undefined,
      testFailureRatePercent: cicd?.testFailureRatePercent ?? undefined,
      reliabilityRating: sonar?.reliabilityRating ?? undefined,
      coverage: sonar?.coverage ?? undefined,
      newCoverage: sonar?.newCoverage ?? undefined,
      qualityGatePassRatePercent: sonar?.qualityGatePassRatePercent ?? undefined,
      reliabilityRemediationEffort: sonar?.reliabilityRemediationEffort ?? undefined,
      newBugs: sonar?.newBugs ?? undefined,
    };
    const reliabilityResult = riskEngine.calculateRisk(RiskType.RELIABILITY, reliabilityMetrics);
    scores[RiskType.RELIABILITY] = roundRiskScore(reliabilityResult.score);
    log.info({ score: reliabilityResult.score, level: reliabilityResult.level }, 'calculated reliability score');

    // 3. Maintainability
    const maintainabilityMetrics: MaintainabilityMetrics = {
      maintainabilityRating: sonar?.maintainabilityRating ?? undefined,
      linesOfCode: sonar?.linesOfCode ?? undefined,
      codeSmells: sonar?.codeSmells ?? undefined,
      cyclomaticComplexity: sonar?.cyclomaticComplexity ?? undefined,
      cognitiveComplexity: sonar?.cognitiveComplexity ?? undefined,
      duplicatedLinesDensity: sonar?.duplicatedLinesDensity ?? undefined,
      newDuplicatedLinesDensity: sonar?.newDuplicatedLinesDensity ?? undefined,
      hotspotFilesWorstOffenders: sonar?.hotspotFilesWorstOffenders,
      codeChurnHighFrequencyFilesCount: vcs?.codeChurn.filesModifiedGte10Times,
      dependencyUpdateLagDays: vcs?.dependencyUpdateLagAvgDays ?? undefined,
      newTechnicalDebt: sonar?.newTechnicalDebt ?? undefined,
      newCodeSmells: sonar?.newCodeSmells ?? undefined,
    };
    const maintainabilityResult = riskEngine.calculateRisk(RiskType.MAINTAINABILITY, maintainabilityMetrics);
    scores[RiskType.MAINTAINABILITY] = roundRiskScore(maintainabilityResult.score);
    log.info({ score: maintainabilityResult.score, level: maintainabilityResult.level }, 'calculated maintainability score');

    // 4. CI/CD & Deployment Health
    const cicdDeploymentHealthMetrics: CicdDeploymentHealthMetrics = {
      deploymentsPerWeek: cicd?.deploymentsPerWeek ?? undefined,
      deploymentFailureRatePercent: cicd?.deploymentFailureRatePercent ?? undefined,
      mttrHours: cicd?.mttrHours ?? undefined,
      timeToProdHours: cicd?.timeToProdHours ?? undefined,
      pipelineSuccessRatePercent: cicd?.pipelineSuccessRatePercent ?? undefined,
      avgPipelineDurationMinutes: cicd?.avgPipelineDurationMinutes ?? undefined,
    };
    const cicdResult = riskEngine.calculateRisk(RiskType.CICD_DEPLOYMENT_HEALTH, cicdDeploymentHealthMetrics);
    scores[RiskType.CICD_DEPLOYMENT_HEALTH] = roundRiskScore(cicdResult.score);
    log.info({ score: cicdResult.score, level: cicdResult.level }, 'calculated ci/cd deployment health score');

    // 5. Team Health
    const teamHealthMetrics: TeamHealthMetrics = {
      busFactor: vcs?.busFactor,
      codeOwnershipConcentrationPercent,
      reviewNetworkDensityPercent: vcs?.reviewNetworkDensity,
      activeContributionsPerWeek: vcs?.activeContributionsPerWeek,
    };
    const teamHealthResult = riskEngine.calculateRisk(RiskType.TEAM_HEALTH, teamHealthMetrics);
    scores[RiskType.TEAM_HEALTH] = roundRiskScore(teamHealthResult.score);
    log.info({ score: teamHealthResult.score, level: teamHealthResult.level }, 'calculated team health score');

    // 6. Engineering Process
    const engineeringProcessMetrics: EngineeringProcessMetrics = {
      mrMergeTimeHours: undefined, // not yet persisted - see future-work.md #1
      timeToFirstReviewHours: vcs?.timeToFirstReviewAvgHours ?? undefined,
      reviewCommentsPerMrAvg: vcs?.reviewCommentsPerPrAvg ?? undefined,
      reviewCommentsPer100LinesAvg: vcs?.reviewCommentsPer100LinesAvg ?? undefined,
      unresolvedThreadsAtMergeCount: vcs?.unresolvedDiscussionThreadsAtMergeCount ?? undefined,
      reviewIterationCount: vcs?.reviewIterationCountAvg,
      prReviewCoveragePercent: vcs?.prReviewCoveragePercent,
      selfMergedPrRatePercent: vcs?.selfMergedPrRatePercent,
      commitMessageQualityPercent,
      longLivedBranchesCount: vcs?.longLivedBranchesCount,
      avgPipelineRunsPerPr: cicd?.avgPipelineRunsPerPr ?? undefined,
      issueCycleTimeDays,
      leadTimeAvgDays: jira?.leadTime.avgDays ?? undefined,
      leadTimeMedianDays: jira?.leadTime.medianDays ?? undefined,
      leadTimeP95Days: jira?.leadTime.p95Days ?? undefined,
      blockedItemsCount: jira?.blockedItemsCount,
      blockedTicketPercent: jira?.blockedWork.blockedTicketPercent ?? undefined,
      blockedItemsAvgAgeDays: jira?.blockedItemsAvgAgeDays ?? undefined,
      blockedReentryCount: jira?.blockedWork.blockedReentryCount,
      overdueItemsCount: jira?.overdueItemsCount,
      staleIssuesCount: vcs?.staleIssuesCount,
      staleMrsCount: vcs?.stalePrCount,
      staleTicketRatio: jira?.staleTickets.staleTicketRatio ?? undefined,
    };
    const engineeringProcessResult = riskEngine.calculateRisk(RiskType.ENGINEERING_PROCESS, engineeringProcessMetrics);
    scores[RiskType.ENGINEERING_PROCESS] = roundRiskScore(engineeringProcessResult.score);
    log.info(
      { score: engineeringProcessResult.score, level: engineeringProcessResult.level },
      'calculated engineering process score'
    );

    // 7. Planning & Execution
    const planningExecutionMetrics: PlanningExecutionMetrics = {
      sprintCompletionRate: jira?.sprintCompletionRate ?? undefined,
      scopeCreepRate: jira?.scopeCreepRate ?? undefined,
      storyPointSayDoRatio: jira?.storyPointSayDoRatio ?? undefined,
      carryoverRate: jira?.carryoverRate ?? undefined,
      spilloverRatio: jira?.spillover.spilloverRatio ?? undefined,
      midSprintAdditions: jira?.scopeChurn.midSprintAdditions,
      consecutiveSpilloverCount: jira?.spillover.consecutiveSpilloverCount,
      carryoverAvgSprintsSurvived: jira?.spillover.carryoverAvgSprintsSurvived ?? undefined,
      priorityChangeCount: jira?.scopeChurn.priorityChangeCount,
      epicCompletionRatePercent: jira?.epicCompletionRatePercent ?? undefined,
      throughputPerWeek,
      bugVsFeatureRatio: vcs?.bugVsFeatureRatio.ratio ?? undefined,
    };
    const planningExecutionResult = riskEngine.calculateRisk(RiskType.PLANNING_EXECUTION, planningExecutionMetrics);
    scores[RiskType.PLANNING_EXECUTION] = roundRiskScore(planningExecutionResult.score);
    log.info(
      { score: planningExecutionResult.score, level: planningExecutionResult.level },
      'calculated planning & execution score'
    );

    await saveAllRiskScores(projectSnapshotId, scores as Record<RiskType, number | null>);

    log.info({ elapsedMs: Date.now() - startedAt }, 'risk scores calculated and saved successfully');
    return scores;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error({ err: error, elapsedMs: Date.now() - startedAt }, 'failed to calculate risk scores');
    throw error;
  }
}

/**
 * Fetch all tool metrics for a snapshot from the database. Each table's
 * `metrics` jsonb column round-trips as the connector's own camelCase
 * `metrics` object - see each connector's own -metrics.types.ts (under
 * backend/libs/connectors/) for the exact shape. A table with no row for
 * this snapshot yields `null` for that tool, same as it never having been
 * synced.
 */
async function fetchMetricsForSnapshot(projectSnapshotId: number): Promise<{
  versionControl: GitHubMetricsResponse['metrics'] | null;
  projectManagement: JiraMetricsResponse['metrics'] | null;
  codeOwnershipConcentrationPercent: number | undefined;
  codeQuality: SonarQubeMetricsResponse['metrics'] | null;
  cicd: GithubActionsMetricsResponse['metrics'] | null;
}> {
  const client = assertSupabaseClient();

  const { data: vcRow } = await client
    .from('versioncontrolmetrics')
    .select('metrics')
    .eq('snapshot_id', projectSnapshotId)
    .maybeSingle();

  const { data: pmRow } = await client
    .from('projectmanagementmetrics')
    .select('metrics')
    .eq('snapshot_id', projectSnapshotId)
    .maybeSingle();

  const { data: cqRow } = await client
    .from('codequalitymetrics')
    .select('metrics')
    .eq('snapshot_id', projectSnapshotId)
    .maybeSingle();

  const { data: codeOwnershipData } = await client
    .from('codeownershipconcentration')
    .select('top_contributor_percent')
    .eq('snapshot_id', projectSnapshotId);

  const { data: cicdRow } = await client
    .from('cicdmetrics')
    .select('metrics')
    .eq('snapshot_id', projectSnapshotId)
    .maybeSingle();

  let codeOwnershipConcentrationPercent: number | undefined;
  if (codeOwnershipData && codeOwnershipData.length > 0) {
    const avgTopContributor =
      codeOwnershipData.reduce(
        (sum, row) => sum + (typeof row.top_contributor_percent === 'number' ? row.top_contributor_percent : 0),
        0
      ) / codeOwnershipData.length;
    codeOwnershipConcentrationPercent = Math.round(avgTopContributor * 100) / 100;
  }

  return {
    versionControl: (vcRow?.metrics as GitHubMetricsResponse['metrics']) ?? null,
    projectManagement: (pmRow?.metrics as JiraMetricsResponse['metrics']) ?? null,
    codeOwnershipConcentrationPercent,
    codeQuality: (cqRow?.metrics as SonarQubeMetricsResponse['metrics']) ?? null,
    cicd: (cicdRow?.metrics as GithubActionsMetricsResponse['metrics']) ?? null,
  };
}
