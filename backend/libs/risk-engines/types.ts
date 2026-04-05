export enum RiskType {
  DELIVERY = "DELIVERY",
  CODE_QUALITY = "CODE_QUALITY",
  ENGINEERING_PROCESS = "ENGINEERING_PROCESS",
  CICD_RELIABILITY = "CICD_RELIABILITY",
  TEAM_HEALTH = "TEAM_HEALTH",
  SECURITY_RISK = "SECURITY_RISK",
}

export type DeliveryMetrics = {
  sprintCompletionRate?: number;
  issueCycleTimeDays?: number;
  throughputPerWeek?: number;
  carryoverRate?: number;
  scopeCreepRate?: number;
  estimationAccuracy?: number;
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
  pipelineDurationTrendDelta30d?: number;
  deploymentFrequencyPerWeek?: number;
  deploymentFailureRatePercent?: number;
  mttrHours?: number;
  flakyTestCount?: number;
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

export type SecurityRiskMetrics = {
  openCriticalVulnerabilities?: number;
  openHighVulnerabilities?: number;
  dependencyUpdateLagDays?: number;
  prRevertRatePercent?: number;
  incidentMttrHours?: number;
  longLivedUnmergedBranchesCount?: number;
};

export type RiskMetricsByType = {
  [RiskType.DELIVERY]: DeliveryMetrics;
  [RiskType.CODE_QUALITY]: CodeQualityMetrics;
  [RiskType.ENGINEERING_PROCESS]: EngineeringProcessMetrics;
  [RiskType.CICD_RELIABILITY]: CicdReliabilityMetrics;
  [RiskType.TEAM_HEALTH]: TeamHealthMetrics;
  [RiskType.SECURITY_RISK]: SecurityRiskMetrics;
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