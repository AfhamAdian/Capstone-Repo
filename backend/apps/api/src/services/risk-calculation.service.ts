/**
 * Risk Calculation Service
 * Calculates risk scores based on collected metrics and saves them to the database
 */

import { RiskEngine } from '@libs/risk-engines/risk-engine.js';
import {
  RiskType,
  type DeliveryMetrics,
  type CodeQualityMetrics,
  type EngineeringProcessMetrics,
  type CicdReliabilityMetrics,
  type TeamHealthMetrics,
  type SecurityRiskMetrics,
} from '@libs/risk-engines/types.js';
import { saveAllRiskScores } from '../database/risk-score.js';
import { assertSupabaseClient } from '../config/supabase.js';
import { logger } from '@libs/logger.js';

const log = logger.child({ component: 'risk-calculation-service' });

type MetricsRecord = Record<string, unknown>;

/**
 * Safely extract a number from metrics
 */
function getNumberMetric(obj: MetricsRecord | null, key: string): number | undefined {
  if (!obj) return undefined;
  const value = obj[key];
  if (typeof value === 'number') return value;
  return undefined;
}

/**
 * Calculate and save all risk scores for a project snapshot
 */
export async function calculateAndSaveRiskScores(projectSnapshotId: number): Promise<void> {
  const startedAt = Date.now();

  try {
    log.info({ projectSnapshotId }, 'starting risk score calculation');

    // Fetch metrics from the database
    const metrics = await fetchMetricsForSnapshot(projectSnapshotId);

    // Initialize risk engine
    const riskEngine = new RiskEngine();

    // Calculate all risk scores
    const scores: Record<string, number | null> = {};

    // 1. Delivery Risk
    const deliveryMetrics: DeliveryMetrics = {
      sprintCompletionRate: getNumberMetric(metrics.projectManagement, 'sprint_completion_rate'),
      issueCycleTimeDays: getNumberMetric(metrics.projectManagement, 'issue_cycle_time_avg_days'),
      throughputPerWeek: getNumberMetric(metrics.projectManagement, 'throughput_per_week'),
      carryoverRate: getNumberMetric(metrics.projectManagement, 'carryover_rate'),
      scopeCreepRate: getNumberMetric(metrics.projectManagement, 'scope_creep_rate'),
      estimationAccuracy: getNumberMetric(metrics.projectManagement, 'estimation_accuracy'),
    };

    if (Object.values(deliveryMetrics).some((v) => v !== undefined)) {
      const deliveryResult = riskEngine.calculateRisk(RiskType.DELIVERY, deliveryMetrics);
      scores[RiskType.DELIVERY] = deliveryResult.score;
      log.info({ score: deliveryResult.score, level: deliveryResult.level }, 'calculated delivery risk');
    } else {
      scores[RiskType.DELIVERY] = null;
    }

    // 2. Code Quality Risk (requires VCS metrics - may not have all data)
    const codeQualityMetrics: CodeQualityMetrics = {
      // Code quality metrics would typically come from code analysis tools
      // For now, we use available VCS metrics as proxies
      codeDuplicationPercent: undefined,
      technicalDebtRatioPercent: undefined,
    };

    const codeQualityResult = riskEngine.calculateRisk(RiskType.CODE_QUALITY, codeQualityMetrics);
    scores[RiskType.CODE_QUALITY] = codeQualityResult.score;
    log.info({ score: codeQualityResult.score, level: codeQualityResult.level }, 'calculated code quality risk');

    // 3. Engineering Process Risk
    const commitBodyPercent = getNumberMetric(metrics.versionControl, 'commit_with_body_percent') ?? 0;
    const commitIssueRefPercent = getNumberMetric(metrics.versionControl, 'commit_with_issue_ref_percent') ?? 0;

    const engineeringProcessMetrics: EngineeringProcessMetrics = {
      prReviewCoveragePercent: getNumberMetric(metrics.versionControl, 'pr_review_coverage_percent'),
      selfMergedPrRatePercent: getNumberMetric(metrics.versionControl, 'self_merged_pr_rate_percent'),
      timeToFirstReviewHours: getNumberMetric(metrics.versionControl, 'time_to_first_review_avg_hours'),
      commitMessageQualityPercent:
        getNumberMetric(metrics.versionControl, 'commit_following_convention_percent') ??
        (commitBodyPercent + commitIssueRefPercent) / 2,
      longLivedBranchesCount: getNumberMetric(metrics.versionControl, 'long_lived_branches_count'),
      stalePrCount: getNumberMetric(metrics.versionControl, 'stale_pr_count'),
    };

    const engineeringProcessResult = riskEngine.calculateRisk(RiskType.ENGINEERING_PROCESS, engineeringProcessMetrics);
    scores[RiskType.ENGINEERING_PROCESS] = engineeringProcessResult.score;
    log.info(
      { score: engineeringProcessResult.score, level: engineeringProcessResult.level },
      'calculated engineering process risk'
    );

    // 4. CI/CD Reliability Risk (would require CI/CD metrics)
    const cicdReliabilityMetrics: CicdReliabilityMetrics = {
      // CI/CD metrics would come from external sources like Jenkins, GitLab CI, etc.
      pipelineSuccessRatePercent: undefined,
      deploymentFailureRatePercent: undefined,
      deploymentFrequencyPerWeek: undefined,
    };

    const cicdReliabilityResult = riskEngine.calculateRisk(RiskType.CICD_RELIABILITY, cicdReliabilityMetrics);
    scores[RiskType.CICD_RELIABILITY] = cicdReliabilityResult.score;
    log.info(
      { score: cicdReliabilityResult.score, level: cicdReliabilityResult.level },
      'calculated ci/cd reliability risk'
    );

    // 5. Team Health Risk
    const teamHealthMetrics: TeamHealthMetrics = {
      busFactor: getNumberMetric(metrics.versionControl, 'bus_factor'),
      codeOwnershipConcentrationPercent: getNumberMetric(metrics.codeOwnershipStats, 'avgTopContributorPercent'),
      reviewNetworkDensityPercent: getNumberMetric(metrics.versionControl, 'review_network_density'),
      activeContributionsPerWeek: getNumberMetric(metrics.versionControl, 'active_contributions_per_week'),
      blockedItemsCount: getNumberMetric(metrics.projectManagement, 'blocked_items_count'),
      blockedItemsAvgAgeDays: getNumberMetric(metrics.projectManagement, 'blocked_items_avg_age_days'),
      overdueItemsCount: getNumberMetric(metrics.projectManagement, 'overdue_items_count'),
    };

    const teamHealthResult = riskEngine.calculateRisk(RiskType.TEAM_HEALTH, teamHealthMetrics);
    scores[RiskType.TEAM_HEALTH] = teamHealthResult.score;
    log.info({ score: teamHealthResult.score, level: teamHealthResult.level }, 'calculated team health risk');

    // 6. Security Risk
    const securityRiskMetrics: SecurityRiskMetrics = {
      // Security metrics would come from security scanning tools
      openCriticalVulnerabilities: undefined,
      openHighVulnerabilities: undefined,
      dependencyUpdateLagDays: getNumberMetric(metrics.versionControl, 'dependency_update_lag_avg_days'),
      prRevertRatePercent: getNumberMetric(metrics.versionControl, 'pr_revert_rate_percent'),
    };

    const securityRiskResult = riskEngine.calculateRisk(RiskType.SECURITY_RISK, securityRiskMetrics);
    scores[RiskType.SECURITY_RISK] = securityRiskResult.score;
    log.info({ score: securityRiskResult.score, level: securityRiskResult.level }, 'calculated security risk');

    // Save all risk scores to database
    await saveAllRiskScores(projectSnapshotId, scores);

    log.info({ elapsedMs: Date.now() - startedAt }, 'risk scores calculated and saved successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error({ err: error, elapsedMs: Date.now() - startedAt }, 'failed to calculate risk scores');
    throw error;
  }
}

/**
 * Fetch all metrics for a snapshot from the database
 */
async function fetchMetricsForSnapshot(projectSnapshotId: number): Promise<{
  versionControl: MetricsRecord | null;
  projectManagement: MetricsRecord | null;
  codeOwnershipStats: MetricsRecord | null;
}> {
  const client = assertSupabaseClient();

  // Fetch version control metrics
  const { data: vcMetrics, error: vcError } = await client
    .from('versioncontrolmetrics')
    .select('*')
    .eq('snapshot_id', projectSnapshotId)
    .single();

  // Fetch project management metrics
  const { data: pmMetrics, error: pmError } = await client
    .from('projectmanagementmetrics')
    .select('*')
    .eq('snapshot_id', projectSnapshotId)
    .single();

  // Fetch code ownership concentration
  const { data: codeOwnershipData, error: coError } = await client
    .from('codeownershipconcentration')
    .select('top_contributor_percent')
    .eq('snapshot_id', projectSnapshotId);

  // Calculate average code ownership concentration
  let codeOwnershipStats: MetricsRecord | null = null;
  if (codeOwnershipData && codeOwnershipData.length > 0) {
    const avgTopContributor =
      codeOwnershipData.reduce((sum, row) => sum + (typeof row.top_contributor_percent === 'number' ? row.top_contributor_percent : 0), 0) /
      codeOwnershipData.length;
    codeOwnershipStats = {
      avgTopContributorPercent: Math.round(avgTopContributor * 100) / 100,
      count: codeOwnershipData.length,
    };
  }

  return {
    versionControl: (vcMetrics ?? null) as MetricsRecord | null,
    projectManagement: (pmMetrics ?? null) as MetricsRecord | null,
    codeOwnershipStats,
  };
}

