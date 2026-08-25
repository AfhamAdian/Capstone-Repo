import { Octokit } from '@octokit/rest';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import type { IConnector, ConnectorOutput } from '@libs/sync/index.js';
import type {
  GithubActionsMetricsResponse,
  GithubActionsConnectorOptions,
  CreateGithubActionsConnectorInput,
} from './github-actions.types.js';

const RATE_LIMIT_THRESHOLD = 100;
const RATE_LIMIT_PAUSE_MS = 60_000;
const PAGE_SIZE = 100;
const DEFAULT_DEPLOYMENT_ENVIRONMENT = 'production';
const DEFAULT_DEPLOYMENT_WINDOW_DAYS = 30;
const DEFAULT_MTTR_LOOKBACK_DAYS = 90;
const MAX_MERGE_CANDIDATES_PER_DEPLOYMENT = 5;
const DEFAULT_TEST_REPORT_ARTIFACT_PATTERN = 'junit|test-results|test-report';
const DEFAULT_COVERAGE_ARTIFACT_PATTERN = 'coverage';
// How many of the most recent completed runs to sample for artifact-based metrics
// (Test Failure Rate) — downloading/unzipping every run in a repo's history would be
// prohibitively expensive, so this trades exhaustiveness for a bounded, recent sample.
const TEST_ARTIFACT_SAMPLE_SIZE = 20;

export class GithubActionsConnector implements IConnector {
  private credentials: { token: string };
  private project: { owner: string; repo: string };
  private octokit: Octokit;
  private options: Required<GithubActionsConnectorOptions>;

  constructor(input: CreateGithubActionsConnectorInput) {
    if (!input.credentials.token) {
      throw new Error('GitHub token is required');
    }
    if (!input.project.owner || !input.project.repo) {
      throw new Error('GitHub owner and repo are required');
    }

    this.credentials = { token: input.credentials.token };
    this.project = {
      owner: input.project.owner,
      repo: input.project.repo,
    };
    this.octokit = new Octokit({ auth: input.credentials.token });
    this.options = {
      deploymentEnvironment: input.options?.deploymentEnvironment ?? DEFAULT_DEPLOYMENT_ENVIRONMENT,
      deploymentWindowDays: input.options?.deploymentWindowDays ?? DEFAULT_DEPLOYMENT_WINDOW_DAYS,
      mttrLookbackDays: input.options?.mttrLookbackDays ?? DEFAULT_MTTR_LOOKBACK_DAYS,
      testReportArtifactPattern:
        input.options?.testReportArtifactPattern ?? DEFAULT_TEST_REPORT_ARTIFACT_PATTERN,
      coverageArtifactPattern:
        input.options?.coverageArtifactPattern ?? DEFAULT_COVERAGE_ARTIFACT_PATTERN,
    };
  }

  private async checkRateLimit(): Promise<void> {
    try {
      const { data } = await this.octokit.rateLimit.get();
      const remaining = data.resources.core.remaining;
      const resetAt = new Date(data.resources.core.reset * 1000);

      if (remaining < RATE_LIMIT_THRESHOLD) {
        const waitMs = Math.max(resetAt.getTime() - Date.now(), RATE_LIMIT_PAUSE_MS);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    } catch {
      // ignore rate-limit check failures
    }
  }

  async getData(): Promise<ConnectorOutput> {
    const { owner, repo } = this.project;
    const now = new Date();

    const [workflowRuns, deployments, defaultBranch] = await Promise.all([
      this.fetchWorkflowRuns(),
      this.fetchDeployments(),
      this.getDefaultBranch(),
    ]);
    const mergedPrs = await this.fetchMergedPullRequests(defaultBranch);

    const pipelineSuccessRatePercent = this.calcPipelineSuccessRate(workflowRuns, defaultBranch);
    const avgPipelineDurationMinutes = this.calcPipelineDuration(workflowRuns, defaultBranch);
    const flakyTestCount = await this.calcFlakyTests(workflowRuns);
    const testCoveragePercent = await this.calcTestCoverageRate(workflowRuns);
    const testFailureRatePercent = await this.calcTestFailureRate(workflowRuns);
    const avgPipelineRunsPerPr = this.calcRunsPerPr(workflowRuns);
    const deploymentsPerWeek = this.calcDeploymentFrequency(deployments);
    const deploymentFailureRatePercent = await this.calcDeploymentFailureRate(deployments);
    const mttrHours = this.calcMttr(workflowRuns, defaultBranch);
    const timeToProdHours = await this.calcTimeToProd(deployments, mergedPrs);

    const metrics: GithubActionsMetricsResponse = {
      generatedAt: now.toISOString(),
      repo: {
        owner,
        repo,
        fullName: `${owner}/${repo}`,
      },
      metrics: {
        pipelineSuccessRatePercent,
        avgPipelineDurationMinutes,
        flakyTestCount,
        testCoveragePercent,
        testFailureRatePercent,
        avgPipelineRunsPerPr,
        deploymentsPerWeek,
        deploymentFailureRatePercent,
        mttrHours,
        timeToProdHours,
      }
    };

    return {
      tool: 'github-actions',
      provider: 'github',
      data: metrics,
      fetchedAt: now,
    };
  }

  private async fetchWorkflowRuns(): Promise<any[]> {
    await this.checkRateLimit();
    const runs = await this.octokit.paginate(this.octokit.actions.listWorkflowRunsForRepo, {
      owner: this.project.owner,
      repo: this.project.repo,
      per_page: PAGE_SIZE,
    });
    return runs;
  }

  private async fetchDeployments(): Promise<any[]> {
    await this.checkRateLimit();
    const deployments = await this.octokit.paginate(this.octokit.repos.listDeployments, {
      owner: this.project.owner,
      repo: this.project.repo,
      environment: this.options.deploymentEnvironment,
      per_page: PAGE_SIZE,
    });
    return deployments;
  }

  private async getDefaultBranch(): Promise<string> {
    await this.checkRateLimit();
    const { data } = await this.octokit.repos.get({
      owner: this.project.owner,
      repo: this.project.repo,
    });
    return data.default_branch;
  }

  private async fetchMergedPullRequests(defaultBranch: string): Promise<any[]> {
    await this.checkRateLimit();
    const prs = await this.octokit.paginate(this.octokit.pulls.list, {
      owner: this.project.owner,
      repo: this.project.repo,
      state: 'closed',
      base: defaultBranch,
      sort: 'updated',
      direction: 'desc',
      per_page: PAGE_SIZE,
    });
    return prs.filter((pr: any) => pr.merged_at && pr.merge_commit_sha);
  }

  // null (not 100) when there's no evaluable data — a repo with zero default-branch
  // runs hasn't "succeeded 100% of the time," it just has nothing to judge.
  private calcPipelineSuccessRate(runs: any[], defaultBranch: string): number | null {
    const completed = runs.filter(r => r.head_branch === defaultBranch && r.status === 'completed');
    if (completed.length === 0) return null;
    const successes = completed.filter(r => r.conclusion === 'success').length;
    const totalEvaluated = completed.filter(r => ['success', 'failure', 'timed_out'].includes(r.conclusion)).length;
    if (totalEvaluated === 0) return null;
    return Math.round((successes / totalEvaluated) * 100);
  }

  private calcPipelineDuration(runs: any[], defaultBranch: string): number | null {
    const completed = runs.filter(
      r => r.head_branch === defaultBranch && r.status === 'completed' && r.run_started_at && r.updated_at,
    );
    if (completed.length === 0) return null;
    let totalMs = 0;
    for (const r of completed) {
      const start = new Date(r.run_started_at).getTime();
      const end = new Date(r.updated_at).getTime();
      totalMs += (end - start);
    }
    return Math.round((totalMs / completed.length) / 60000);
  }

  // null only when there's no run history at all to assess — zero retried-then-succeeded
  // runs among real run data is a legitimate, measured "0", not "unmeasurable".
  private async calcFlakyTests(runs: any[]): Promise<number | null> {
    if (runs.length === 0) return null;

    const retriedRuns = runs.filter(r => r.run_attempt > 1);
    let flakyCount = 0;
    for (const run of retriedRuns) {
      if (run.conclusion === 'success') {
        flakyCount += 1;
      }
    }
    return flakyCount;
  }

  private parseLcovCoverage(content: string): { linesFound: number; linesHit: number } | null {
    const foundLines = content.match(/^LF:(\d+)$/gm);
    const hitLines = content.match(/^LH:(\d+)$/gm);
    if (!foundLines || !hitLines) return null;

    const linesFound = foundLines.reduce((sum, line) => sum + Number(line.split(':')[1]), 0);
    const linesHit = hitLines.reduce((sum, line) => sum + Number(line.split(':')[1]), 0);

    return linesFound > 0 ? { linesFound, linesHit } : null;
  }

  private parseCoberturaCoverage(xml: string): { linesFound: number; linesHit: number } | null {
    try {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
      const coverage = parser.parse(xml)?.coverage;
      if (!coverage) return null;

      const linesValid = Number(coverage['lines-valid'] ?? NaN);
      const linesCovered = Number(coverage['lines-covered'] ?? NaN);
      if (!Number.isNaN(linesValid) && linesValid > 0) {
        return { linesFound: linesValid, linesHit: Number.isNaN(linesCovered) ? 0 : linesCovered };
      }

      // Some Cobertura generators omit valid/covered counts and only report line-rate (0-1)
      const lineRate = Number(coverage['line-rate'] ?? NaN);
      return Number.isNaN(lineRate) ? null : { linesFound: 100, linesHit: Math.round(lineRate * 100) };
    } catch {
      return null;
    }
  }

  private parseIstanbulCoverage(json: string): { linesFound: number; linesHit: number } | null {
    try {
      const lines = JSON.parse(json)?.total?.lines;
      if (typeof lines?.total !== 'number' || typeof lines?.covered !== 'number') return null;

      return lines.total > 0 ? { linesFound: lines.total, linesHit: lines.covered } : null;
    } catch {
      return null;
    }
  }

  // Format is inferred from filename convention, not the artifact name (an artifact matching
  // coverageArtifactPattern can contain any of these) — tried in turn until one parses.
  private parseCoverageFile(entryName: string, content: string): { linesFound: number; linesHit: number } | null {
    const name = entryName.toLowerCase();

    if (name.endsWith('.info') || name.includes('lcov')) return this.parseLcovCoverage(content);
    if (name.endsWith('.xml')) return this.parseCoberturaCoverage(content);
    if (name.endsWith('.json')) return this.parseIstanbulCoverage(content);
    return null;
  }

  private async fetchCoverageFromRun(
    runId: number,
    namePattern: RegExp,
  ): Promise<{ linesFound: number; linesHit: number } | null> {
    const artifacts = await this.fetchWorkflowRunArtifacts(runId);
    const matching = artifacts.filter((a: any) => !a.expired && namePattern.test(a.name));

    for (const artifact of matching) {
      const zipBuffer = await this.downloadArtifactZip(artifact.id);
      if (!zipBuffer) continue;

      try {
        const zip = new AdmZip(zipBuffer);
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) continue;
          const parsed = this.parseCoverageFile(entry.entryName, zip.readAsText(entry));
          if (parsed) return parsed;
        }
      } catch {
        // Skip a corrupt/unreadable archive and try the next matching artifact, if any
      }
    }

    return null;
  }

  // Unlike Test Failure Rate, this doesn't aggregate across the sampled runs — coverage is a
  // snapshot of the codebase at one commit, not something that's meaningful to average across
  // several different runs. Returns the most recent sampled run's coverage that could be parsed.
  private async calcTestCoverageRate(runs: any[]): Promise<number | null> {
    const sampledRuns = runs
      .filter(r => r.status === 'completed')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, TEST_ARTIFACT_SAMPLE_SIZE);

    if (sampledRuns.length === 0) return null;

    const namePattern = new RegExp(this.options.coverageArtifactPattern, 'i');

    for (const run of sampledRuns) {
      const coverage = await this.fetchCoverageFromRun(run.id, namePattern);
      if (coverage && coverage.linesFound > 0) {
        return Math.round((coverage.linesHit / coverage.linesFound) * 100);
      }
    }

    return null;
  }

  private async fetchWorkflowRunArtifacts(runId: number): Promise<any[]> {
    await this.checkRateLimit();
    return this.octokit.paginate(this.octokit.actions.listWorkflowRunArtifacts, {
      owner: this.project.owner,
      repo: this.project.repo,
      run_id: runId,
      per_page: PAGE_SIZE,
    });
  }

  private async downloadArtifactZip(artifactId: number): Promise<Buffer | null> {
    try {
      await this.checkRateLimit();
      const response = await this.octokit.actions.downloadArtifact({
        owner: this.project.owner,
        repo: this.project.repo,
        artifact_id: artifactId,
        archive_format: 'zip',
      });
      return Buffer.from(response.data as unknown as ArrayBuffer);
    } catch {
      return null;
    }
  }

  // Finds the first non-expired artifact on this run whose name matches namePattern,
  // downloads and unzips it, and returns the text of the first file inside matching
  // fileExtension. No universal artifact-naming convention exists across repos, so a
  // repo using an unrecognized name or format simply yields null here, same as any
  // other "can't measure it" case in this codebase.
  private async fetchReportFileFromRun(
    runId: number,
    namePattern: RegExp,
    fileExtension: string,
  ): Promise<string | null> {
    const artifacts = await this.fetchWorkflowRunArtifacts(runId);
    const matching = artifacts.filter((a: any) => !a.expired && namePattern.test(a.name));

    for (const artifact of matching) {
      const zipBuffer = await this.downloadArtifactZip(artifact.id);
      if (!zipBuffer) continue;

      try {
        const zip = new AdmZip(zipBuffer);
        const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(fileExtension));
        if (entry) return zip.readAsText(entry);
      } catch {
        // Skip a corrupt/unreadable archive and try the next matching artifact, if any
      }
    }

    return null;
  }

  // Sums tests/failures/errors across every <testsuite> found (whether the file's root is a
  // single <testsuite> or a <testsuites> wrapping several) rather than trusting any aggregate
  // attribute on <testsuites> itself, to avoid double-counting if both are present.
  private parseJUnitTestCounts(xml: string): { tests: number; failures: number; errors: number } | null {
    try {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
      const parsed = parser.parse(xml);

      const root = parsed.testsuites ?? parsed.testsuite;
      if (!root) return null;

      const suiteList = parsed.testsuites
        ? (Array.isArray(root.testsuite) ? root.testsuite : root.testsuite ? [root.testsuite] : [])
        : [root];

      if (suiteList.length === 0) return null;

      let tests = 0;
      let failures = 0;
      let errors = 0;

      for (const suite of suiteList) {
        tests += Number(suite.tests ?? 0);
        failures += Number(suite.failures ?? 0);
        errors += Number(suite.errors ?? 0);
      }

      return tests > 0 ? { tests, failures, errors } : null;
    } catch {
      return null;
    }
  }

  private async calcTestFailureRate(runs: any[]): Promise<number | null> {
    const sampledRuns = runs
      .filter(r => r.status === 'completed')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, TEST_ARTIFACT_SAMPLE_SIZE);

    if (sampledRuns.length === 0) return null;

    const namePattern = new RegExp(this.options.testReportArtifactPattern, 'i');

    let totalTests = 0;
    let totalFailingTests = 0;
    let runsWithData = 0;

    for (const run of sampledRuns) {
      const xml = await this.fetchReportFileFromRun(run.id, namePattern, '.xml');
      if (!xml) continue;

      const counts = this.parseJUnitTestCounts(xml);
      if (!counts) continue;

      totalTests += counts.tests;
      totalFailingTests += counts.failures + counts.errors;
      runsWithData++;
    }

    if (runsWithData === 0 || totalTests === 0) return null;

    return Math.round((totalFailingTests / totalTests) * 100);
  }

  // null (not 0) when there are no PR-linked runs at all — this is an average
  // (runs per PR), and an average over zero PRs isn't a measured zero.
  private calcRunsPerPr(runs: any[]): number | null {
    const prMap = new Map<number, number>();
    for (const r of runs) {
      if (r.pull_requests && r.pull_requests.length > 0) {
        for (const pr of r.pull_requests) {
          prMap.set(pr.number, (prMap.get(pr.number) || 0) + 1);
        }
      }
    }
    if (prMap.size === 0) return null;
    const totalRuns = Array.from(prMap.values()).reduce((a, b) => a + b, 0);
    return Math.round((totalRuns / prMap.size) * 10) / 10;
  }

  // null when there's no deployment history at all for this environment (can't tell
  // whether that means "genuinely no deploys" or "this repo doesn't use this feature").
  // A real 0 is still reported when there IS history but none fall in the window —
  // that's an actual measured "zero deploys recently", a materially different fact.
  private calcDeploymentFrequency(deployments: any[]): number | null {
    if (deployments.length === 0) return null;

    const windowDays = this.options.deploymentWindowDays;
    const windowStart = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const recentDeployments = deployments.filter(d => new Date(d.created_at).getTime() > windowStart);

    const perWeek = recentDeployments.length / (windowDays / 7);
    return Math.round(perWeek * 10) / 10;
  }

  private async calcDeploymentFailureRate(deployments: any[]): Promise<number | null> {
    if (deployments.length === 0) return null;

    const windowStart = Date.now() - this.options.deploymentWindowDays * 24 * 60 * 60 * 1000;
    const recentDeployments = deployments.filter(d => new Date(d.created_at).getTime() > windowStart);

    let failureCount = 0;
    let evaluatedCount = 0;

    for (const d of recentDeployments) {
      try {
        await this.checkRateLimit();
        const statuses = await this.octokit.paginate(this.octokit.repos.listDeploymentStatuses, {
          owner: this.project.owner,
          repo: this.project.repo,
          deployment_id: d.id,
        });

        if (statuses.length > 0) {
          const latestStatus = statuses.reduce((latest, s) =>
            new Date(s.created_at).getTime() > new Date(latest.created_at).getTime() ? s : latest,
          );
          if (latestStatus.state === 'failure' || latestStatus.state === 'error') {
            failureCount++;
          }
          evaluatedCount++;
        }
      } catch {
        // ignore
      }
    }

    // No deployment in the window could actually be evaluated — nothing to measure,
    // not a clean pass ("0% failure").
    if (evaluatedCount === 0) return null;
    return Math.round((failureCount / evaluatedCount) * 100);
  }

  // Groups by workflow_id (not adjacency in a global timeline — a same-workflow
  // failure->success pair could otherwise be missed if a different workflow's run
  // happens to land between them) and, within each workflow's own chronological
  // order, measures the gap from the start of a failure streak to the next success.
  private calcMttr(runs: any[], defaultBranch: string): number | null {
    const lookbackStart = Date.now() - this.options.mttrLookbackDays * 24 * 60 * 60 * 1000;
    const completed = runs.filter(
      r =>
        r.head_branch === defaultBranch &&
        r.status === 'completed' &&
        new Date(r.updated_at).getTime() > lookbackStart,
    );

    const byWorkflow = new Map<number, any[]>();
    for (const run of completed) {
      const group = byWorkflow.get(run.workflow_id) ?? [];
      group.push(run);
      byWorkflow.set(run.workflow_id, group);
    }

    let totalMttrMs = 0;
    let recoveryEvents = 0;

    for (const group of byWorkflow.values()) {
      group.sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());

      let failureStartedAt: number | null = null;
      for (const run of group) {
        if (['failure', 'timed_out'].includes(run.conclusion) && failureStartedAt === null) {
          failureStartedAt = new Date(run.updated_at).getTime();
        } else if (run.conclusion === 'success' && failureStartedAt !== null) {
          totalMttrMs += new Date(run.updated_at).getTime() - failureStartedAt;
          recoveryEvents++;
          failureStartedAt = null;
        }
      }
    }

    // No failure->success recovery observed — either zero incidents (good) or zero
    // data. Either way there's no recovery *time* to report, so null, not "0 hours".
    if (recoveryEvents === 0) return null;
    return Math.round((totalMttrMs / recoveryEvents) / 3600000 * 10) / 10;
  }

  // ancestorSha's history contains descendantSha's changes iff descendantSha is not
  // "behind" ancestorSha at all — i.e. everything in ancestorSha is already reachable from descendantSha.
  private async isCommitAncestor(ancestorSha: string, descendantSha: string): Promise<boolean> {
    try {
      await this.checkRateLimit();
      const { data } = await this.octokit.repos.compareCommitsWithBasehead({
        owner: this.project.owner,
        repo: this.project.repo,
        basehead: `${ancestorSha}...${descendantSha}`,
      });
      return data.behind_by === 0;
    } catch {
      return false;
    }
  }

  // For each deployment, finds the most recently-merged PR (merged before the deployment)
  // whose merge commit is verified — via commit ancestry, not just timestamp proximity — to
  // actually be included in that deployment's SHA. Checks at most a few candidates per
  // deployment (the most-recent-eligible merge is almost always the right one) rather than
  // every merged PR ever, to keep the API-call cost bounded.
  private async calcTimeToProd(deployments: any[], mergedPrs: any[]): Promise<number | null> {
    const windowStart = Date.now() - this.options.deploymentWindowDays * 24 * 60 * 60 * 1000;
    const recentDeployments = deployments.filter(d => new Date(d.created_at).getTime() > windowStart);
    if (recentDeployments.length === 0 || mergedPrs.length === 0) return null;

    const sortedPrs = [...mergedPrs].sort(
      (a, b) => new Date(b.merged_at).getTime() - new Date(a.merged_at).getTime(),
    );

    const leadTimesMs: number[] = [];

    for (const deployment of recentDeployments) {
      const deployedAt = new Date(deployment.created_at).getTime();
      const candidates = sortedPrs.filter(pr => new Date(pr.merged_at).getTime() <= deployedAt);

      for (const pr of candidates.slice(0, MAX_MERGE_CANDIDATES_PER_DEPLOYMENT)) {
        const includesMerge = await this.isCommitAncestor(pr.merge_commit_sha, deployment.sha);
        if (includesMerge) {
          leadTimesMs.push(deployedAt - new Date(pr.merged_at).getTime());
          break;
        }
      }
    }

    if (leadTimesMs.length === 0) return null;

    const avgMs = leadTimesMs.reduce((sum, ms) => sum + ms, 0) / leadTimesMs.length;
    return Math.round((avgMs / 3600000) * 10) / 10;
  }
}
