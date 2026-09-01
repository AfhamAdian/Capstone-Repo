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

type JUnitTestCase = { name: string; status: 'passed' | 'failed' | 'skipped' };

export class GithubActionsConnector implements IConnector {
  private credentials: { token: string };
  private project: { owner: string; repo: string };
  private octokit: Octokit;
  private options: Required<GithubActionsConnectorOptions>;
  // Populated lazily; the same sampled runs are examined by both Test Failure Rate and
  // Flaky Test Count, so this avoids downloading/parsing each run's JUnit artifact twice.
  private junitCasesCache = new Map<number, Promise<JUnitTestCase[]>>();

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
    // These two metrics read the same JUnit artifacts. The promise cache below
    // lets them run concurrently while downloading each run's reports only once.
    const [flakyTestCount, testFailureRatePercent] = await Promise.all([
      this.calcFlakyTests(workflowRuns),
      this.calcTestFailureRate(workflowRuns),
    ]);
    const testCoveragePercent = await this.calcTestCoverageRate(workflowRuns);
    const avgPipelineRunsPerPr = this.calcRunsPerPr(workflowRuns);
    const deploymentsPerWeek = this.calcDeploymentFrequency(deployments);
    const [deploymentFailureRatePercent, timeToProdHours] = await Promise.all([
      this.calcDeploymentFailureRate(deployments),
      this.calcTimeToProd(deployments, mergedPrs),
    ]);
    const mttrHours = this.calcMttr(workflowRuns, defaultBranch);

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

  private sampleRecentCompletedRuns(runs: any[]): any[] {
    return runs
      .filter(r => r.status === 'completed')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, TEST_ARTIFACT_SAMPLE_SIZE);
  }

  // Real per-test flakiness: groups the sampled runs by head_sha (identical commit) and, within
  // any group with 2+ runs, checks whether the same test name shows both a pass and a fail —
  // that's the literal definition (inconsistent result, no code change). Falls back to the old
  // run-level "retried then succeeded" proxy only when no same-commit comparison was possible
  // (e.g. no JUnit artifacts found, or every commit in the sample only ran once).
  private async calcFlakyTests(runs: any[]): Promise<number | null> {
    if (runs.length === 0) return null;

    const namePattern = new RegExp(this.options.testReportArtifactPattern, 'i');
    const sampledRuns = this.sampleRecentCompletedRuns(runs);

    const bySha = new Map<string, any[]>();
    for (const run of sampledRuns) {
      const group = bySha.get(run.head_sha) ?? [];
      group.push(run);
      bySha.set(run.head_sha, group);
    }

    const flakyTestNames = new Set<string>();
    let comparableShaGroups = 0;

    for (const group of bySha.values()) {
      if (group.length < 2) continue;

      const outcomesByTest = new Map<string, Set<'passed' | 'failed'>>();
      let sawJUnitData = false;

      for (const run of group) {
        const cases = await this.fetchJUnitTestCasesForRun(run.id, namePattern);
        if (cases.length === 0) continue;
        sawJUnitData = true;

        for (const testCase of cases) {
          if (testCase.status === 'skipped') continue;
          const outcomes = outcomesByTest.get(testCase.name) ?? new Set();
          outcomes.add(testCase.status);
          outcomesByTest.set(testCase.name, outcomes);
        }
      }

      if (!sawJUnitData) continue;
      comparableShaGroups++;

      for (const [testName, outcomes] of outcomesByTest) {
        if (outcomes.has('passed') && outcomes.has('failed')) {
          flakyTestNames.add(testName);
        }
      }
    }

    if (comparableShaGroups > 0) return flakyTestNames.size;

    // No same-commit re-run data available anywhere in the sample — fall back to the proxy.
    const retriedRuns = runs.filter(r => r.run_attempt > 1);
    return retriedRuns.filter(r => r.conclusion === 'success').length;
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

  // Aggregates across every parseable coverage file found for this run (matrix builds or
  // monorepos often produce several — one per OS/version/package — that all describe the
  // same commit and should be combined into one figure, not just the first one found).
  private async fetchCoverageFromRun(
    runId: number,
    namePattern: RegExp,
  ): Promise<{ linesFound: number; linesHit: number } | null> {
    const entries = await this.fetchArtifactEntries(runId, namePattern);

    let linesFound = 0;
    let linesHit = 0;
    let matchedAny = false;

    for (const entry of entries) {
      const parsed = this.parseCoverageFile(entry.entryName, entry.content);
      if (!parsed) continue;

      linesFound += parsed.linesFound;
      linesHit += parsed.linesHit;
      matchedAny = true;
    }

    return matchedAny && linesFound > 0 ? { linesFound, linesHit } : null;
  }

  // Unlike Test Failure Rate, this doesn't aggregate across the sampled runs — coverage is a
  // snapshot of the codebase at one commit, not something that's meaningful to average across
  // several different runs. Returns the most recent sampled run's coverage that could be parsed.
  private async calcTestCoverageRate(runs: any[]): Promise<number | null> {
    const sampledRuns = this.sampleRecentCompletedRuns(runs);
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

  // Returns the text content of every non-directory file across every non-expired artifact
  // on this run whose name matches namePattern — the shared foundation for both test-report
  // and coverage parsing, aggregating across matrix builds' multiple report files rather than
  // stopping at the first one found.
  private async fetchArtifactEntries(
    runId: number,
    namePattern: RegExp,
  ): Promise<Array<{ entryName: string; content: string }>> {
    const artifacts = await this.fetchWorkflowRunArtifacts(runId);
    const matching = artifacts.filter((a: any) => !a.expired && namePattern.test(a.name));

    const entries: Array<{ entryName: string; content: string }> = [];

    for (const artifact of matching) {
      const zipBuffer = await this.downloadArtifactZip(artifact.id);
      if (!zipBuffer) continue;

      try {
        const zip = new AdmZip(zipBuffer);
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) continue;
          entries.push({ entryName: entry.entryName, content: zip.readAsText(entry) });
        }
      } catch {
        // Skip a corrupt/unreadable archive and continue with the next matching artifact, if any
      }
    }

    return entries;
  }

  // Per-test results (not just aggregate counts) — needed for real flaky-test detection, which
  // has to compare individual test outcomes across runs, not just overall pass/fail totals.
  private parseJUnitTestCases(xml: string): JUnitTestCase[] {
    try {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
      const parsed = parser.parse(xml);

      const root = parsed.testsuites ?? parsed.testsuite;
      if (!root) return [];

      const suiteList = parsed.testsuites
        ? (Array.isArray(root.testsuite) ? root.testsuite : root.testsuite ? [root.testsuite] : [])
        : [root];

      const cases: JUnitTestCase[] = [];
      for (const suite of suiteList) {
        const rawCases = suite.testcase;
        const testcases = Array.isArray(rawCases) ? rawCases : rawCases ? [rawCases] : [];

        for (const testcase of testcases) {
          const classname = testcase.classname ?? '';
          const name = classname ? `${classname}.${testcase.name ?? 'unknown'}` : (testcase.name ?? 'unknown');

          let status: JUnitTestCase['status'] = 'passed';
          if (testcase.failure !== undefined || testcase.error !== undefined) status = 'failed';
          else if (testcase.skipped !== undefined) status = 'skipped';

          cases.push({ name, status });
        }
      }

      return cases;
    } catch {
      return [];
    }
  }

  // Aggregates every matching JUnit XML file across all of this run's matching artifacts
  // (matrix builds commonly produce one per OS/version) into one flat list of test cases.
  // Memoized per run id since both Test Failure Rate and Flaky Test Count examine the same
  // sampled runs and would otherwise download/parse each run's artifact twice.
  private async fetchJUnitTestCasesForRun(runId: number, namePattern: RegExp): Promise<JUnitTestCase[]> {
    const cached = this.junitCasesCache.get(runId);
    if (cached) return cached;

    const pending = (async () => {
      const entries = await this.fetchArtifactEntries(runId, namePattern);
      const cases: JUnitTestCase[] = [];
      for (const entry of entries) {
        if (!entry.entryName.toLowerCase().endsWith('.xml')) continue;
        cases.push(...this.parseJUnitTestCases(entry.content));
      }
      return cases;
    })();

    this.junitCasesCache.set(runId, pending);

    try {
      return await pending;
    } catch (error) {
      // Allow a later metric to retry a transient failed artifact request.
      if (this.junitCasesCache.get(runId) === pending) {
        this.junitCasesCache.delete(runId);
      }
      throw error;
    }
  }

  private async calcTestFailureRate(runs: any[]): Promise<number | null> {
    const sampledRuns = this.sampleRecentCompletedRuns(runs);
    if (sampledRuns.length === 0) return null;

    const namePattern = new RegExp(this.options.testReportArtifactPattern, 'i');

    let totalTests = 0;
    let totalFailingTests = 0;

    for (const run of sampledRuns) {
      const cases = await this.fetchJUnitTestCasesForRun(run.id, namePattern);
      const executed = cases.filter(c => c.status !== 'skipped');
      if (executed.length === 0) continue;

      totalTests += executed.length;
      totalFailingTests += executed.filter(c => c.status === 'failed').length;
    }

    if (totalTests === 0) return null;

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
