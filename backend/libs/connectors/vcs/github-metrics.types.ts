/**
 * GitHub metrics return types
 */

export interface GitHubMetricsResponse {
  generatedAt: string;
  repo: {
    owner: string;
    repo: string;
    fullName: string;
  };
  metrics: {
    issuesClosedPerWeek: number;
    issueCycleTimeAvgDays: number | null;
    codeChurn: {
      filesModifiedGte10Times: number;
      filesModifiedByGte3People: number;
    };
    prReviewCoveragePercent: number;
    reviewPerPrAvg: number;
    selfMergedPrRatePercent: number;
    timeToFirstReviewAvgHours: number | null;
    commitMessageQuality: {
      withIssueRefPercent: number;
      withBodyPercent: number;
      followingConventionPercent: number;
    };
    stalePrCount: number;
    longLivedBranchesCount: number;
    busFactor: number;
    codeOwnershipConcentration: {
      directories: Array<{
        path: string;
        topContributorPercent: number;
        isFlagged: boolean;
      }>;
    };
    activeContributionsPerWeek: number;
    reviewNetworkDensity: number;
    prRevertRatePercent: number;
    dependencyUpdateLagAvgDays: number | null;
  };
}
