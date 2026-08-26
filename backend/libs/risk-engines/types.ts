export enum RiskType {
  DELIVERY = "DELIVERY",
  CODE_QUALITY = "CODE_QUALITY",
  ENGINEERING_PROCESS = "ENGINEERING_PROCESS",
  CICD_RELIABILITY = "CICD_RELIABILITY",
  TEAM_HEALTH = "TEAM_HEALTH",
  // Added for the survey feature's rubric (delivery/codeQuality/cicd/teamHealth/blockers),
  // which doesn't map 1:1 onto the 6 categories above - see backend/db/migrations/002_survey.sql.
  BLOCKERS = "BLOCKERS",
  // New health-score model (backend/libs/risk-engines/scoring-rules/*.md), replacing the old
  // risk scores one at a time. SECURITY replaces the retired SECURITY_RISK.
  SECURITY = "SECURITY",
}

export type DeliveryMetrics = {
  sprintCompletionRate?: number;
  issueCycleTimeDays?: number;
  throughputPerWeek?: number;
  carryoverRate?: number;
  scopeCreepRate?: number;
  consecutiveLowSprintCompletionCount?: number;
};

export type CodeQualityMetrics = {
  codeCoveragePercent?: number;
  codeCoverageTrendDelta30d?: number;
  cyclomaticComplexityTrendDelta30d?: number;
  codeDuplicationPercent?: number;
  technicalDebtRatioPercent?: number;
  todoFixmeHackTrendDelta30d?: number;
  codeChurnRiskPercent?: number;
};

export type EngineeringProcessMetrics = {
  prReviewCoveragePercent?: number;
  selfMergedPrRatePercent?: number;
  timeToFirstReviewHours?: number;
  unresolvedThreadsMergedCount?: number;
  commitMessageQualityPercent?: number;
  longLivedBranchesCount?: number;
  stalePrCount?: number;
};

export type CicdReliabilityMetrics = {
  pipelineSuccessRatePercent?: number;
  avgPipelineDurationMinutes?: number;
  flakyTestCount?: number;
  testCoveragePercent?: number;
  testFailureRatePercent?: number;
  avgPipelineRunsPerPr?: number;
  deploymentsPerWeek?: number;
  deploymentFailureRatePercent?: number;
  mttrHours?: number;
  timeToProdHours?: number;
};

export type TeamHealthMetrics = {
  busFactor?: number;
  codeOwnershipConcentrationPercent?: number;
  reviewNetworkDensityPercent?: number;
  activeContributionsPerWeek?: number;
  blockedItemsCount?: number;
  blockedItemsAvgAgeDays?: number;
  overdueItemsCount?: number;
  hasBusFactorOneCriticalModule?: boolean;
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

export type BlockersMetrics = {
  blockedItemsCount?: number;
  blockedItemsAvgAgeDays?: number;
  overdueItemsCount?: number;
};

export type RiskMetricsByType = {
  [RiskType.DELIVERY]: DeliveryMetrics;
  [RiskType.CODE_QUALITY]: CodeQualityMetrics;
  [RiskType.ENGINEERING_PROCESS]: EngineeringProcessMetrics;
  [RiskType.CICD_RELIABILITY]: CicdReliabilityMetrics;
  [RiskType.TEAM_HEALTH]: TeamHealthMetrics;
  [RiskType.BLOCKERS]: BlockersMetrics;
  [RiskType.SECURITY]: SecurityMetrics;
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