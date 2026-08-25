import { Octokit } from '@octokit/rest';
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

  private calcPipelineSuccessRate(runs: any[], defaultBranch: string): number {
    const completed = runs.filter(r => r.head_branch === defaultBranch && r.status === 'completed');
    if (completed.length === 0) return 100;
    const successes = completed.filter(r => r.conclusion === 'success').length;
    const totalEvaluated = completed.filter(r => ['success', 'failure', 'timed_out'].includes(r.conclusion)).length;
    if (totalEvaluated === 0) return 100;
    return Math.round((successes / totalEvaluated) * 100);
  }

  private calcPipelineDuration(runs: any[], defaultBranch: string): number {
    const completed = runs.filter(
      r => r.head_branch === defaultBranch && r.status === 'completed' && r.run_started_at && r.updated_at,
    );
    if (completed.length === 0) return 0;
    let totalMs = 0;
    for (const r of completed) {
      const start = new Date(r.run_started_at).getTime();
      const end = new Date(r.updated_at).getTime();
      totalMs += (end - start);
    }
    return Math.round((totalMs / completed.length) / 60000);
  }

  private async calcFlakyTests(runs: any[]): Promise<number> {
    const retriedRuns = runs.filter(r => r.run_attempt > 1);
    let flakyCount = 0;
    for (const run of retriedRuns) {
      if (run.conclusion === 'success') {
        flakyCount += 1;
      }
    }
    return flakyCount;
  }

  private async calcTestCoverageRate(runs: any[]): Promise<number> {
    // TODO: Download actual test coverage XML artifacts from octokit.rest.actions.downloadArtifact
    // and parse percentages using xml2js.
    return 75; // Stub value for prototype
  }

  private async calcTestFailureRate(runs: any[]): Promise<number> {
    // TODO: Download job logs or JUnit artifacts to count exact executed vs failed tests.
    return 2; // Stub value for prototype (2% failure rate)
  }

  private calcRunsPerPr(runs: any[]): number {
    const prMap = new Map<number, number>();
    for (const r of runs) {
      if (r.pull_requests && r.pull_requests.length > 0) {
        for (const pr of r.pull_requests) {
          prMap.set(pr.number, (prMap.get(pr.number) || 0) + 1);
        }
      }
    }
    if (prMap.size === 0) return 0;
    const totalRuns = Array.from(prMap.values()).reduce((a, b) => a + b, 0);
    return Math.round((totalRuns / prMap.size) * 10) / 10;
  }

  private calcDeploymentFrequency(deployments: any[]): number {
    if (deployments.length === 0) return 0;

    const windowDays = this.options.deploymentWindowDays;
    const windowStart = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const recentDeployments = deployments.filter(d => new Date(d.created_at).getTime() > windowStart);

    const perWeek = recentDeployments.length / (windowDays / 7);
    return Math.round(perWeek * 10) / 10;
  }

  private async calcDeploymentFailureRate(deployments: any[]): Promise<number> {
    if (deployments.length === 0) return 0;

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

    if (evaluatedCount === 0) return 0;
    return Math.round((failureCount / evaluatedCount) * 100);
  }

  // Groups by workflow_id (not adjacency in a global timeline — a same-workflow
  // failure->success pair could otherwise be missed if a different workflow's run
  // happens to land between them) and, within each workflow's own chronological
  // order, measures the gap from the start of a failure streak to the next success.
  private calcMttr(runs: any[], defaultBranch: string): number {
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

    if (recoveryEvents === 0) return 0;
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
