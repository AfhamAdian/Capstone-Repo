import { Octokit } from '@octokit/rest';
import type { IConnector, ConnectorOutput, CreateConnectorInput } from '@libs/sync/index.js';
import type { GithubActionsMetricsResponse } from './github-actions.types.js';

const RATE_LIMIT_THRESHOLD = 100;
const RATE_LIMIT_PAUSE_MS = 60_000;
const PAGE_SIZE = 100;

export class GithubActionsConnector implements IConnector {
  private credentials: { token: string };
  private project: { owner: string; repo: string };
  private octokit: Octokit;

  constructor(input: CreateConnectorInput) {
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

    const [workflowRuns, prRuns, deployments] = await Promise.all([
      this.fetchWorkflowRuns(),
      this.fetchPullRequestRuns(),
      this.fetchDeployments(),
    ]);

    const pipelineSuccessRatePercent = this.calcPipelineSuccessRate(workflowRuns);
    const avgPipelineDurationMinutes = this.calcPipelineDuration(workflowRuns);
    const flakyTestCount = await this.calcFlakyTests(workflowRuns);
    const testCoveragePercent = await this.calcTestCoverageRate(workflowRuns);
    const testFailureRatePercent = await this.calcTestFailureRate(workflowRuns);
    const avgPipelineRunsPerPr = this.calcRunsPerPr(prRuns);
    const deploymentsPerWeek = this.calcDeploymentFrequency(deployments);
    const deploymentFailureRatePercent = await this.calcDeploymentFailureRate(deployments);
    const mttrHours = this.calcMttr(workflowRuns);
    const timeToProdHours = await this.calcTimeToProd(deployments);

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
      tool: 'github-actions' as any,
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

  private async fetchPullRequestRuns(): Promise<any[]> {
    await this.checkRateLimit();
    const runs = await this.octokit.paginate(this.octokit.actions.listWorkflowRunsForRepo, {
      owner: this.project.owner,
      repo: this.project.repo,
      event: 'pull_request',
      per_page: PAGE_SIZE,
    });
    return runs;
  }

  private async fetchDeployments(): Promise<any[]> {
    await this.checkRateLimit();
    const deployments = await this.octokit.paginate(this.octokit.repos.listDeployments, {
      owner: this.project.owner,
      repo: this.project.repo,
      environment: 'production',
      per_page: PAGE_SIZE,
    });
    return deployments;
  }

  private calcPipelineSuccessRate(runs: any[]): number {
    const completed = runs.filter(r => r.status === 'completed');
    if (completed.length === 0) return 100;
    const successes = completed.filter(r => r.conclusion === 'success').length;
    const totalEvaluated = completed.filter(r => ['success', 'failure', 'timed_out'].includes(r.conclusion)).length;
    if (totalEvaluated === 0) return 100;
    return Math.round((successes / totalEvaluated) * 100);
  }

  private calcPipelineDuration(runs: any[]): number {
    const completed = runs.filter(r => r.status === 'completed' && r.run_started_at && r.updated_at);
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
    
    const sorted = [...deployments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentDeployments = sorted.filter(d => new Date(d.created_at).getTime() > thirtyDaysAgo);
    
    const perWeek = recentDeployments.length / (30 / 7);
    return Math.round(perWeek * 10) / 10;
  }

  private async calcDeploymentFailureRate(deployments: any[]): Promise<number> {
    if (deployments.length === 0) return 0;
    let failureCount = 0;
    let evaluatedCount = 0;

    for (const d of deployments.slice(0, 10)) { // limit checking to recent 10
      try {
        await this.checkRateLimit();
        const statuses = await this.octokit.paginate(this.octokit.repos.listDeploymentStatuses, {
          owner: this.project.owner,
          repo: this.project.repo,
          deployment_id: d.id,
        });

        if (statuses.length > 0) {
          const latestState = statuses[0]!.state;
          if (latestState === 'failure' || latestState === 'error') {
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

  private calcMttr(runs: any[]): number {
    const completed = runs.filter(r => r.status === 'completed');
    completed.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    let totalMttr = 0;
    let mttrEvents = 0;

    for (let i = 0; i < completed.length - 1; i++) {
      const current = completed[i];
      const previous = completed[i + 1];

      if (current.conclusion === 'success' && ['failure', 'timed_out'].includes(previous.conclusion)) {
        if (current.workflow_id === previous.workflow_id) {
          const timeDiff = new Date(current.updated_at).getTime() - new Date(previous.updated_at).getTime();
          if (timeDiff > 0) {
            totalMttr += timeDiff;
            mttrEvents++;
          }
        }
      }
    }

    if (mttrEvents === 0) return 0;
    return Math.round((totalMttr / mttrEvents) / 3600000 * 10) / 10;
  }

  private async calcTimeToProd(deployments: any[]): Promise<number> {
    // TODO: Cross reference PR merged_at timestamp with Deployment sha timestamp
    return 12; // Stub value for prototype (12 hours)
  }
}
