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
    // Issues Closed Per Week (Velocity)
    issuesClosedPerWeek: number;
    // Issue Cycle Time
    issueCycleTimeAvgDays: number | null;
    // Issue Reopen Rate
    issueReopenRatePercent: number | null;
    // Bug vs Feature Ratio — ratio is null when label classification coverage is too low to trust
    bugVsFeatureRatio: {
      bugCount: number;
      featureCount: number;
      totalIssues: number;
      classificationCoveragePercent: number;
      ratio: number | null;
    };
    // MRs Merged Per Week (Throughput)
    prsMergedPerWeek: number;
    // MR Merge Time
    prMergeTimeAvgHours: number | null;
    // Time to First Review
    timeToFirstReviewAvgHours: number | null;
    // Review Comments Per MR
    reviewCommentsPerPrAvg: number | null;
    // MR Revert Rate
    prRevertRatePercent: number;
    // Code Churn - High Frequency Files
    codeChurn: {
      filesModifiedGte10Times: number;
      filesModifiedByGte3People: number;
    };
    // Commit Message Quality
    commitMessageQuality: {
      withIssueRefPercent: number;
      withBodyPercent: number;
      followingConventionPercent: number;
    };
    // Unresolved Discussion Threads at Merge (approximated as current unresolved state on merged PRs)
    unresolvedDiscussionThreadsAtMergeCount: number | null;
    // Review Comments Per 100 Lines
    reviewCommentsPer100LinesAvg: number | null;
    // Bus Factor
    busFactor: number;
    // Code Ownership Concentration
    codeOwnershipConcentration: {
      directories: Array<{ path: string; topContributorPercent: number; isFlagged: boolean }>;
    };
    // Review Network Density
    reviewNetworkDensity: number;
    // Security Vulnerability Count — null when Dependabot/secret-scanning is disabled for the repo, not measured
    securityVulnerabilityCount: number | null;
    // Stale Issues Count
    staleIssuesCount: number;
    // Stale MRs Count
    stalePrCount: number;
    // Review Iteration Count
    reviewIterationCountAvg: number;
    // PR/MR Review Coverage (%)
    prReviewCoveragePercent: number;
    // Self-Merged MR Rate (%)
    selfMergedPrRatePercent: number;
    // Long-Lived Branch Count
    longLivedBranchesCount: number;
    // Active Contributors Per Week
    activeContributionsPerWeek: number;
    // Dependency Update Lag (Average Days)
    dependencyUpdateLagAvgDays: number | null;
  };
}
