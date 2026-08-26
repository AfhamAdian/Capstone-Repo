export enum RiskType {
  DELIVERY = "DELIVERY",
  ENGINEERING_PROCESS = "ENGINEERING_PROCESS",
  CICD_RELIABILITY = "CICD_RELIABILITY",
  TEAM_HEALTH = "TEAM_HEALTH",
  // Added for the survey feature's rubric (delivery/codeQuality/cicd/teamHealth/blockers),
  // which doesn't map 1:1 onto the 6 categories above - see backend/db/migrations/002_survey.sql.
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
}

export type DeliveryMetrics = {
  sprintCompletionRate?: number;
  issueCycleTimeDays?: number;
  throughputPerWeek?: number;
  carryoverRate?: number;
  scopeCreepRate?: number;
  consecutiveLowSprintCompletionCount?: number;
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

export type RiskMetricsByType = {
  [RiskType.DELIVERY]: DeliveryMetrics;
  [RiskType.ENGINEERING_PROCESS]: EngineeringProcessMetrics;
  [RiskType.CICD_RELIABILITY]: CicdReliabilityMetrics;
  [RiskType.TEAM_HEALTH]: TeamHealthMetrics;
  [RiskType.BLOCKERS]: BlockersMetrics;
  [RiskType.SECURITY]: SecurityMetrics;
  [RiskType.RELIABILITY]: ReliabilityMetrics;
  [RiskType.MAINTAINABILITY]: MaintainabilityMetrics;
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