import type { CreateConnectorInput } from '@libs/sync/index.js';

export interface GithubActionsConnectorOptions {
  deploymentEnvironment?: string;
  deploymentWindowDays?: number;
  mttrLookbackDays?: number;
  testReportArtifactPattern?: string;
  coverageArtifactPattern?: string;
}

export interface CreateGithubActionsConnectorInput extends CreateConnectorInput {
  options?: GithubActionsConnectorOptions;
}

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
    testCoveragePercent: number | null;
    testFailureRatePercent: number | null;
    avgPipelineRunsPerPr: number;
    deploymentsPerWeek: number;
    deploymentFailureRatePercent: number;
    mttrHours: number;
    timeToProdHours: number | null;
  };
}
