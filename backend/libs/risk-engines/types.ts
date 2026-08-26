export enum RiskType {
  ENGINEERING_PROCESS = "ENGINEERING_PROCESS",
  TEAM_HEALTH = "TEAM_HEALTH",
  // Legacy 8th type, added for the survey feature's rubric (delivery/codeQuality/cicd/
  // teamHealth/blockers) - see backend/db/migrations/002_survey.sql. Left untouched by the
  // health-score rewrite below; the survey feature is a separate concern.
  BLOCKERS = "BLOCKERS",
  // New health-score model (backend/libs/risk-engines/scoring-rules/*.md), replacing the old
  // risk scores one at a time. SECURITY replaces the retired SECURITY_RISK.
  SECURITY = "SECURITY",
  // New score, no old equivalent - pulls together SonarQube/CI-CD/VCS reliability signals
  // previously scattered across CODE_QUALITY, CICD_RELIABILITY and SECURITY_RISK.
  RELIABILITY = "RELIABILITY",
  // Replaces the retired CODE_QUALITY. Coverage moved out to RELIABILITY; complexity/
  // duplication/churn/hotspot signals stay here.
  MAINTAINABILITY = "MAINTAINABILITY",
  // Replaces the retired CICD_RELIABILITY. Flaky Test Count/Test Failure Rate moved to
  // RELIABILITY; Avg Pipeline Runs Per PR moved to ENGINEERING_PROCESS.
  CICD_DEPLOYMENT_HEALTH = "CICD_DEPLOYMENT_HEALTH",
  // Replaces the retired DELIVERY. Jira-rich - see the doc for why Sub-group B (Delivery
  // Throughput & Focus) is thin (2 metrics) compared to Sub-group A (10 metrics).
  PLANNING_EXECUTION = "PLANNING_EXECUTION",
}

/**
 * Health-score model (backend/libs/risk-engines/scoring-rules/06-engineering-process-score.md).
 * Higher is better. Two 50/50 sub-groups: Review Quality (VCS + CI/CD) and Flow/Bottleneck
 * (mostly Jira, absorbing blocked/overdue/stale concepts that used to sit in Team Health /
 * Blockers). issueCycleTimeDays/leadTimeAvgDays: whichever source resolution (Jira primary,
 * VC fallback) happens upstream should already be baked in by the time this reaches the
 * strategy - it just takes one resolved value per field.
 */
export type EngineeringProcessMetrics = {
  // Sub-group A: Review Quality
  mrMergeTimeHours?: number; // VCS
  timeToFirstReviewHours?: number; // VCS
  reviewCommentsPerMrAvg?: number; // VCS - banded together with reviewCommentsPer100LinesAvg
  reviewCommentsPer100LinesAvg?: number; // VCS - banded together with reviewCommentsPerMrAvg
  unresolvedThreadsAtMergeCount?: number; // VCS
  reviewIterationCount?: number; // VCS
  prReviewCoveragePercent?: number; // VCS
  selfMergedPrRatePercent?: number; // VCS
  commitMessageQualityPercent?: number; // VCS
  longLivedBranchesCount?: number; // VCS
  avgPipelineRunsPerPr?: number; // CI/CD

  // Sub-group B: Flow/Bottleneck
  issueCycleTimeDays?: number; // Jira primary / VC fallback, resolved upstream
  leadTimeAvgDays?: number; // Jira - preferred over issueCycleTimeDays when both are present
  leadTimeMedianDays?: number; // Jira - contextual only, not separately weighted
  leadTimeP95Days?: number; // Jira - contextual only, not separately weighted
  blockedItemsCount?: number; // Jira
  blockedTicketPercent?: number; // Jira
  blockedItemsAvgAgeDays?: number; // Jira
  blockedReentryCount?: number; // Jira
  overdueItemsCount?: number; // Jira
  staleIssuesCount?: number; // VCS - averaged together with staleMrsCount/staleTicketRatio
  staleMrsCount?: number; // VCS - averaged together with staleIssuesCount/staleTicketRatio
  staleTicketRatio?: number; // Jira - averaged together with staleIssuesCount/staleMrsCount
};

/**
 * Health-score model (backend/libs/risk-engines/scoring-rules/04-cicd-deployment-health-score.md).
 * Higher is better. The other 4 metrics of the original 10-metric CI/CD fetch feed
 * RELIABILITY (Flaky Test Count, Test Failure Rate, Test Coverage) and ENGINEERING_PROCESS
 * (Avg Pipeline Runs Per PR) instead - see those score files.
 */
export type CicdDeploymentHealthMetrics = {
  deploymentsPerWeek?: number;
  deploymentFailureRatePercent?: number;
  mttrHours?: number;
  timeToProdHours?: number; // Change Lead Time
  pipelineSuccessRatePercent?: number;
  avgPipelineDurationMinutes?: number;
};

/**
 * Health-score model (backend/libs/risk-engines/scoring-rules/05-team-health-score.md).
 * Higher is better. Blocked/overdue items moved to ENGINEERING_PROCESS's Flow/Bottleneck
 * sub-group; the old hasBusFactorOneCriticalModule kill-switch is dropped (not in the new
 * spec, never backed by real data).
 */
export type TeamHealthMetrics = {
  busFactor?: number;
  codeOwnershipConcentrationPercent?: number;
  reviewNetworkDensityPercent?: number;
  activeContributionsPerWeek?: number;
};

/**
 * Health-score model (backend/libs/risk-engines/scoring-rules/01-security-score.md).
 * Higher is better. Replaces SecurityRiskMetrics/RiskType.SECURITY_RISK.
 */
export type SecurityMetrics = {
  securityVulnerabilityCount?: number; // VCS: dependency + secrets alerts (non-SAST slice)
  linesOfCode?: number; // SonarQube ncloc - denominator for per-KLOC density
  dependencyUpdateLagDays?: number; // VCS - shared with Maintainability
  securityRating?: number; // SonarQube 1(A)..5(E)
  securityHotspots?: number; // SonarQube count
  securityReviewRating?: number; // SonarQube 1(A)..5(E)
  securityRemediationEffort?: number; // SonarQube minutes
  newVulnerabilities?: number; // SonarQube - penalty input
};

/**
 * Health-score model (backend/libs/risk-engines/scoring-rules/02-reliability-score.md).
 * Higher is better. CI/CD's testCoveragePercent is intentionally excluded here per the
 * doc's own default (likely the same source as SonarQube's `coverage`) - add it back only
 * if a project confirms it's a genuinely separate signal.
 */
export type ReliabilityMetrics = {
  issueReopenRatePercent?: number; // VCS
  mrRevertRatePercent?: number; // VCS
  flakyTestCount?: number; // CI/CD
  testFailureRatePercent?: number; // CI/CD
  reliabilityRating?: number; // SonarQube 1(A)..5(E)
  coverage?: number; // SonarQube overall coverage %
  newCoverage?: number; // SonarQube coverage on new code %
  qualityGatePassRatePercent?: number; // SonarQube
  reliabilityRemediationEffort?: number; // SonarQube minutes
  newBugs?: number; // SonarQube - penalty input
};

/**
 * Health-score model (backend/libs/risk-engines/scoring-rules/03-maintainability-score.md).
 * Higher is better. Every scored metric here is "lower raw value is better" - there's no
 * natural ceiling reference in this dimension (unlike Reliability's coverage metrics).
 */
export type MaintainabilityMetrics = {
  maintainabilityRating?: number; // SonarQube 1(A)..5(E)
  linesOfCode?: number; // SonarQube ncloc - denominator for per-KLOC density; not itself scored
  codeSmells?: number; // SonarQube count
  cyclomaticComplexity?: number; // SonarQube raw value (not size-normalized, per the doc)
  cognitiveComplexity?: number; // SonarQube raw value (not size-normalized, per the doc)
  duplicatedLinesDensity?: number; // SonarQube %
  newDuplicatedLinesDensity?: number; // SonarQube %
  hotspotFilesWorstOffenders?: Array<{ file: string; hotspotCount: number }>; // SonarQube - summed, then density
  codeChurnHighFrequencyFilesCount?: number; // VCS: files touched >=10 times
  dependencyUpdateLagDays?: number; // VCS - shared with Security
  newTechnicalDebt?: number; // SonarQube minutes - penalty input
  newCodeSmells?: number; // SonarQube - penalty input
};

export type BlockersMetrics = {
  blockedItemsCount?: number;
  blockedItemsAvgAgeDays?: number;
  overdueItemsCount?: number;
};

/**
 * Health-score model (backend/libs/risk-engines/scoring-rules/07-planning-execution-score.md).
 * Higher is better. Two sub-groups combined 65/35 (not 50/50 - Sub-group B lost most of its
 * metrics vs. the old model and carries far less granular signal than Sub-group A).
 */
export type PlanningExecutionMetrics = {
  // Sub-group A: Sprint Planning Accuracy (Jira)
  sprintCompletionRate?: number;
  scopeCreepRate?: number;
  storyPointSayDoRatio?: number; // banded around 100 (committed == delivered)
  carryoverRate?: number;
  spilloverRatio?: number;
  midSprintAdditions?: number;
  consecutiveSpilloverCount?: number;
  carryoverAvgSprintsSurvived?: number;
  priorityChangeCount?: number;
  epicCompletionRatePercent?: number;

  // Sub-group B: Delivery Throughput & Focus
  throughputPerWeek?: number; // Jira primary / VC fallback, resolved upstream
  bugVsFeatureRatio?: number; // VCS - banded around a target ratio, not driven to 0
};

export type RiskMetricsByType = {
  [RiskType.ENGINEERING_PROCESS]: EngineeringProcessMetrics;
  [RiskType.TEAM_HEALTH]: TeamHealthMetrics;
  [RiskType.BLOCKERS]: BlockersMetrics;
  [RiskType.SECURITY]: SecurityMetrics;
  [RiskType.RELIABILITY]: ReliabilityMetrics;
  [RiskType.MAINTAINABILITY]: MaintainabilityMetrics;
  [RiskType.CICD_DEPLOYMENT_HEALTH]: CicdDeploymentHealthMetrics;
  [RiskType.PLANNING_EXECUTION]: PlanningExecutionMetrics;
};

export type RiskWeight = {
  key: string;
  w: number;
};

export type RiskResult = {
  type: RiskType;
  score: number;
  level: "LOW" | "MEDIUM" | "HIGH";
  weights: RiskWeight[];
};