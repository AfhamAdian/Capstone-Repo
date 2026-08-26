/**
 * End-to-end smoke test: fetch real data from all 4 connectors (GitHub VCS, GitHub Actions
 * CI/CD, SonarQube, Jira), map it into the 7 new risk-engines health-score metric shapes, run
 * them through RiskEngine, and print the resulting scores. No DB, no persistence — this is
 * purely for checking the scoring formulas against real connector output.
 *
 * Run: npx tsx scripts/test-risk-scores.ts
 *
 * Required env (set in backend/.env) — same variables the individual connector test scripts
 * (test-github-metrics.ts, test-github-actions-metrics.ts, test-sonarqube-metrics.ts,
 * test-jira.ts) already use:
 *   GITHUB_TOKEN, GITHUB_TEST_OWNER, GITHUB_TEST_REPO       - VCS + CI/CD (same repo)
 *   SONARQUBE_TOKEN, SONARQUBE_TEST_PROJECT_KEY              - SonarQube
 *   JIRA_TOKEN, JIRA_EMAIL, JIRA_BOARD_URL                   - Jira
 *
 * Optional env:
 *   SONARQUBE_BASE_URL, SONARQUBE_TEST_ORGANIZATION
 *
 * Note: RiskResult.level ("LOW"/"MEDIUM"/"HIGH") is a leftover label from the old risk-scoring
 * model. These are health scores now (higher is better), so "HIGH" here means high health/good,
 * not high risk.
 */

import 'dotenv/config';
import { GitHubConnector } from '@libs/connectors/vcs/index.js';
import type { GitHubMetricsResponse } from '@libs/connectors/vcs/index.js';
import { GithubActionsConnector } from '@libs/connectors/cicd/GithubActionsConnector/github-actions.connector.js';
import type { GithubActionsMetricsResponse } from '@libs/connectors/cicd/GithubActionsConnector/github-actions.types.js';
import { SonarQubeConnector } from '@libs/connectors/quality/index.js';
import type { SonarQubeMetricsResponse } from '@libs/connectors/quality/index.js';
import { JiraConnector } from '@libs/connectors/pm/index.js';
import type { JiraMetricsResponse } from '@libs/connectors/pm/index.js';
import { RiskEngine } from '@libs/risk-engines/risk-engine.js';
import { RiskType } from '@libs/risk-engines/types.js';
import type {
  SecurityMetrics,
  ReliabilityMetrics,
  MaintainabilityMetrics,
  CicdDeploymentHealthMetrics,
  TeamHealthMetrics,
  EngineeringProcessMetrics,
  PlanningExecutionMetrics,
} from '@libs/risk-engines/types.js';

const githubToken = process.env.GITHUB_TOKEN;
const githubOwner = process.env.GITHUB_TEST_OWNER;
const githubRepo = process.env.GITHUB_TEST_REPO;

const sonarqubeToken = process.env.SONARQUBE_TOKEN;
const sonarqubeProjectKey = process.env.SONARQUBE_TEST_PROJECT_KEY;
const sonarqubeBaseUrl = process.env.SONARQUBE_BASE_URL;
const sonarqubeOrganization = process.env.SONARQUBE_TEST_ORGANIZATION;

const jiraToken = process.env.JIRA_TOKEN;
const jiraEmail = process.env.JIRA_EMAIL;
const jiraBoardUrl = process.env.JIRA_BOARD_URL;

const JIRA_BOARD_URL_PATTERN = /^(https:\/\/[^/]+)\/jira\/software\/projects\/([^/]+)\/boards\/(\d+)/;

function parseJiraBoardUrl(url: string): { baseUrl: string; projectKey: string; boardId: string } {
  const match = url.match(JIRA_BOARD_URL_PATTERN);
  if (!match) {
    throw new Error(
      `JIRA_BOARD_URL doesn't look like a Jira board URL. Expected shape: ` +
        `https://your-site.atlassian.net/jira/software/projects/PROJ/boards/1`,
    );
  }
  return { baseUrl: match[1]!, projectKey: match[2]!, boardId: match[3]! };
}

async function main() {
  const missing: string[] = [];
  if (!githubToken || !githubOwner || !githubRepo) missing.push('GITHUB_TOKEN, GITHUB_TEST_OWNER, GITHUB_TEST_REPO');
  if (!sonarqubeToken || !sonarqubeProjectKey) missing.push('SONARQUBE_TOKEN, SONARQUBE_TEST_PROJECT_KEY');
  if (!jiraToken || !jiraEmail || !jiraBoardUrl) missing.push('JIRA_TOKEN, JIRA_EMAIL, JIRA_BOARD_URL');
  if (missing.length > 0) {
    console.error('Missing input. Set in backend/.env:\n  ' + missing.join('\n  '));
    process.exit(1);
  }

  const { baseUrl: jiraBaseUrl, projectKey: jiraProjectKey, boardId: jiraBoardId } = parseJiraBoardUrl(jiraBoardUrl!);

  console.log('1) Fetching from GitHub (VCS)...');
  const vcsOutput = await new GitHubConnector({
    provider: 'github',
    credentials: { token: githubToken! },
    project: { owner: githubOwner!, repo: githubRepo! },
  }).getData();
  const vcs = (vcsOutput.data as GitHubMetricsResponse).metrics;
  console.log('   done.');

  console.log('2) Fetching from GitHub Actions (CI/CD)...');
  const cicdOutput = await new GithubActionsConnector({
    tool: 'github-actions',
    credentials: { token: githubToken! },
    project: { owner: githubOwner!, repo: githubRepo! },
  }).getData();
  const cicd = (cicdOutput.data as GithubActionsMetricsResponse).metrics;
  console.log('   done.');

  console.log('3) Fetching from SonarQube...');
  const qualityOutput = await new SonarQubeConnector({
    provider: 'sonarqube',
    credentials: { token: sonarqubeToken!, baseUrl: sonarqubeBaseUrl },
    project: { projectKey: sonarqubeProjectKey!, organization: sonarqubeOrganization },
  }).getData();
  const sonar = (qualityOutput.data as SonarQubeMetricsResponse).metrics;
  console.log('   done.');

  console.log('4) Fetching from Jira...');
  const pmOutput = await new JiraConnector({
    provider: 'jira',
    credentials: { token: jiraToken!, email: jiraEmail!, baseUrl: jiraBaseUrl },
    project: { projectKey: jiraProjectKey, boardId: jiraBoardId },
  }).getData();
  const jira = (pmOutput.data as JiraMetricsResponse).metrics;
  console.log('   done.\n');

  // --- Map connector outputs into the 7 new health-score metric shapes ---
  // Source-preference rules (Jira primary / VC fallback) and cross-connector derivations are
  // resolved here, exactly as the scoring-rules docs and risk-engines/types.ts describe.

  const directories = vcs.codeOwnershipConcentration.directories;
  const codeOwnershipConcentrationPercent =
    directories.length > 0
      ? directories.reduce((sum, d) => sum + d.topContributorPercent, 0) / directories.length
      : undefined;

  const commitMessageQualityPercent =
    vcs.commitMessageQuality.followingConventionPercent ??
    (vcs.commitMessageQuality.withBodyPercent + vcs.commitMessageQuality.withIssueRefPercent) / 2;

  const issueCycleTimeDays = jira.issueCycleTimeAvgDays ?? vcs.issueCycleTimeAvgDays ?? undefined;
  const throughputPerWeek = jira.throughputPerWeek ?? vcs.issuesClosedPerWeek;

  const securityMetrics: SecurityMetrics = {
    securityVulnerabilityCount: vcs.securityVulnerabilityCount ?? undefined,
    linesOfCode: sonar.linesOfCode ?? undefined,
    dependencyUpdateLagDays: vcs.dependencyUpdateLagAvgDays ?? undefined,
    securityRating: sonar.securityRating ?? undefined,
    securityHotspots: sonar.securityHotspots ?? undefined,
    securityReviewRating: sonar.securityReviewRating ?? undefined,
    securityRemediationEffort: sonar.securityRemediationEffort ?? undefined,
    newVulnerabilities: sonar.newVulnerabilities ?? undefined,
  };

  const reliabilityMetrics: ReliabilityMetrics = {
    issueReopenRatePercent: vcs.issueReopenRatePercent ?? undefined,
    mrRevertRatePercent: vcs.prRevertRatePercent,
    flakyTestCount: cicd.flakyTestCount ?? undefined,
    testFailureRatePercent: cicd.testFailureRatePercent ?? undefined,
    reliabilityRating: sonar.reliabilityRating ?? undefined,
    coverage: sonar.coverage ?? undefined,
    newCoverage: sonar.newCoverage ?? undefined,
    qualityGatePassRatePercent: sonar.qualityGatePassRatePercent ?? undefined,
    reliabilityRemediationEffort: sonar.reliabilityRemediationEffort ?? undefined,
    newBugs: sonar.newBugs ?? undefined,
  };

  const maintainabilityMetrics: MaintainabilityMetrics = {
    maintainabilityRating: sonar.maintainabilityRating ?? undefined,
    linesOfCode: sonar.linesOfCode ?? undefined,
    codeSmells: sonar.codeSmells ?? undefined,
    cyclomaticComplexity: sonar.cyclomaticComplexity ?? undefined,
    cognitiveComplexity: sonar.cognitiveComplexity ?? undefined,
    duplicatedLinesDensity: sonar.duplicatedLinesDensity ?? undefined,
    newDuplicatedLinesDensity: sonar.newDuplicatedLinesDensity ?? undefined,
    hotspotFilesWorstOffenders: sonar.hotspotFilesWorstOffenders,
    codeChurnHighFrequencyFilesCount: vcs.codeChurn.filesModifiedGte10Times,
    dependencyUpdateLagDays: vcs.dependencyUpdateLagAvgDays ?? undefined,
    newTechnicalDebt: sonar.newTechnicalDebt ?? undefined,
    newCodeSmells: sonar.newCodeSmells ?? undefined,
  };

  const cicdDeploymentHealthMetrics: CicdDeploymentHealthMetrics = {
    deploymentsPerWeek: cicd.deploymentsPerWeek ?? undefined,
    deploymentFailureRatePercent: cicd.deploymentFailureRatePercent ?? undefined,
    mttrHours: cicd.mttrHours ?? undefined,
    timeToProdHours: cicd.timeToProdHours ?? undefined,
    pipelineSuccessRatePercent: cicd.pipelineSuccessRatePercent ?? undefined,
    avgPipelineDurationMinutes: cicd.avgPipelineDurationMinutes ?? undefined,
  };

  const teamHealthMetrics: TeamHealthMetrics = {
    busFactor: vcs.busFactor,
    codeOwnershipConcentrationPercent,
    reviewNetworkDensityPercent: vcs.reviewNetworkDensity,
    activeContributionsPerWeek: vcs.activeContributionsPerWeek,
  };

  const engineeringProcessMetrics: EngineeringProcessMetrics = {
    mrMergeTimeHours: vcs.prMergeTimeAvgHours ?? undefined,
    timeToFirstReviewHours: vcs.timeToFirstReviewAvgHours ?? undefined,
    reviewCommentsPerMrAvg: vcs.reviewCommentsPerPrAvg ?? undefined,
    reviewCommentsPer100LinesAvg: vcs.reviewCommentsPer100LinesAvg ?? undefined,
    unresolvedThreadsAtMergeCount: vcs.unresolvedDiscussionThreadsAtMergeCount ?? undefined,
    reviewIterationCount: vcs.reviewIterationCountAvg,
    prReviewCoveragePercent: vcs.prReviewCoveragePercent,
    selfMergedPrRatePercent: vcs.selfMergedPrRatePercent,
    commitMessageQualityPercent,
    longLivedBranchesCount: vcs.longLivedBranchesCount,
    avgPipelineRunsPerPr: cicd.avgPipelineRunsPerPr ?? undefined,
    issueCycleTimeDays,
    leadTimeAvgDays: jira.leadTime.avgDays ?? undefined,
    leadTimeMedianDays: jira.leadTime.medianDays ?? undefined,
    leadTimeP95Days: jira.leadTime.p95Days ?? undefined,
    blockedItemsCount: jira.blockedItemsCount,
    blockedTicketPercent: jira.blockedWork.blockedTicketPercent ?? undefined,
    blockedItemsAvgAgeDays: jira.blockedItemsAvgAgeDays ?? undefined,
    blockedReentryCount: jira.blockedWork.blockedReentryCount,
    overdueItemsCount: jira.overdueItemsCount,
    staleIssuesCount: vcs.staleIssuesCount,
    staleMrsCount: vcs.stalePrCount,
    staleTicketRatio: jira.staleTickets.staleTicketRatio ?? undefined,
  };

  const planningExecutionMetrics: PlanningExecutionMetrics = {
    sprintCompletionRate: jira.sprintCompletionRate ?? undefined,
    scopeCreepRate: jira.scopeCreepRate ?? undefined,
    storyPointSayDoRatio: jira.storyPointSayDoRatio ?? undefined,
    carryoverRate: jira.carryoverRate ?? undefined,
    spilloverRatio: jira.spillover.spilloverRatio ?? undefined,
    midSprintAdditions: jira.scopeChurn.midSprintAdditions,
    consecutiveSpilloverCount: jira.spillover.consecutiveSpilloverCount,
    carryoverAvgSprintsSurvived: jira.spillover.carryoverAvgSprintsSurvived ?? undefined,
    priorityChangeCount: jira.scopeChurn.priorityChangeCount,
    epicCompletionRatePercent: jira.epicCompletionRatePercent ?? undefined,
    throughputPerWeek,
    bugVsFeatureRatio: vcs.bugVsFeatureRatio.ratio ?? undefined,
  };

  const riskEngine = new RiskEngine();
  const results = [
    riskEngine.calculateRisk(RiskType.SECURITY, securityMetrics),
    riskEngine.calculateRisk(RiskType.RELIABILITY, reliabilityMetrics),
    riskEngine.calculateRisk(RiskType.MAINTAINABILITY, maintainabilityMetrics),
    riskEngine.calculateRisk(RiskType.CICD_DEPLOYMENT_HEALTH, cicdDeploymentHealthMetrics),
    riskEngine.calculateRisk(RiskType.TEAM_HEALTH, teamHealthMetrics),
    riskEngine.calculateRisk(RiskType.ENGINEERING_PROCESS, engineeringProcessMetrics),
    riskEngine.calculateRisk(RiskType.PLANNING_EXECUTION, planningExecutionMetrics),
  ];

  console.log('=== Health Scores (0-100, higher is better) ===\n');
  for (const result of results) {
    console.log(`${result.type}: ${Math.round(result.score)} (${result.level})`);
    console.dir(result.weights, { depth: null });
    console.log('');
  }
}

main().catch((error) => {
  console.error('\nFAILED:', error?.message ?? error);
  process.exit(1);
});
