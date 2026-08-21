export interface GithubActionsMetricsResponse {
  generatedAt: string;
  repo: {
    owner: string;
    repo: string;
    fullName: string;
  };
  metrics: {
    pipelineSuccessRatePercent: number;
    avgPipelineDurationMinutes: number;
    flakyTestCount: number;
    testCoveragePercent: number;
    testFailureRatePercent: number;
    avgPipelineRunsPerPr: number;
    deploymentsPerWeek: number;
    deploymentFailureRatePercent: number;
    mttrHours: number;
    timeToProdHours: number;
  };
}
