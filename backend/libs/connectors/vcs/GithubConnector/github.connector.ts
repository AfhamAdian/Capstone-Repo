/**
 * GitHub VCS Connector Implementation
 */

import { Octokit } from '@octokit/rest';
import { IVcsConnector } from '../connector.interface.js';
import { CreateVcsConnectorInput } from '../types.js';
import { GitHubMetricsResponse } from '../github-metrics.types.js';
import type { IConnector, ConnectorOutput } from '@libs/sync/index.js';

const RATE_LIMIT_THRESHOLD = 100;
const RATE_LIMIT_PAUSE_MS = 60_000;
const PAGE_SIZE = 100;

export class GitHubConnector implements IVcsConnector, IConnector {
  private credentials: { token: string };
  private project: { owner: string; repo: string };
  private octokit: Octokit;

  constructor(input: CreateVcsConnectorInput) {
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

  private getTimeframe(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  async getData(): Promise<ConnectorOutput> {
    const { owner, repo } = this.project;
    const now = new Date();

    // Fetch all required data in parallel
    const [issues, prs, commits, branches, defaultBranch] = await Promise.all([
      this.fetchClosedIssues(),
      this.fetchAllPullRequests(),
      this.fetchCommits(30),
      this.fetchBranches(),
      this.getDefaultBranch(),
    ]);

    // Calculate metrics
    const issuesClosedPerWeek = this.calculateIssuesClosedPerWeek(issues);
    const issueCycleTimeAvgDays = this.calculateIssueCycleTime(issues);
    const codeChurn = await this.calculateCodeChurn(commits);
    const prReviewCoverage = this.calculatePrReviewCoverage(prs);
    const reviewPerPrAvg = this.calculateReviewPerPr(prs);
    const selfMergedPrRate = this.calculateSelfMergedPrRate(prs);
    const timeToFirstReview = await this.calculateTimeToFirstReview(prs);
    const commitMessageQuality = this.calculateCommitMessageQuality(commits);
    const stalePrCount = this.calculateStalePrCount(prs);
    const longLivedBranches = this.calculateLongLivedBranches(branches, defaultBranch);
    const busFactor = this.calculateBusFactor(commits);
    const codeOwnershipConcentration = await this.calculateCodeOwnershipConcentration(
      commits,
    );
    const activeContributionsPerWeek = this.calculateActiveContributionsPerWeek(
      commits,
      prs,
      issues,
    );
    const reviewNetworkDensity = this.calculateReviewNetworkDensity(prs);
    const prRevertRate = this.calculatePrRevertRate(prs);
    const dependencyUpdateLag = await this.calculateDependencyUpdateLag();

    const metrics: GitHubMetricsResponse = {
      generatedAt: now.toISOString(),
      repo: {
        owner,
        repo,
        fullName: `${owner}/${repo}`,
      },
      metrics: {
        issuesClosedPerWeek,
        issueCycleTimeAvgDays,
        codeChurn,
        prReviewCoveragePercent: prReviewCoverage,
        reviewPerPrAvg,
        selfMergedPrRatePercent: selfMergedPrRate,
        timeToFirstReviewAvgHours: timeToFirstReview,
        commitMessageQuality,
        stalePrCount,
        longLivedBranchesCount: longLivedBranches,
        busFactor,
        codeOwnershipConcentration,
        activeContributionsPerWeek,
        reviewNetworkDensity,
        prRevertRatePercent: prRevertRate,
        dependencyUpdateLagAvgDays: dependencyUpdateLag,
      },
    };

    // Return as ConnectorOutput for the general sync pipeline
    return {
      tool: 'github',
      provider: 'github',
      data: metrics,
      fetchedAt: now,
    };
  }

  private async fetchClosedIssues(): Promise<any[]> {
    const since = this.getTimeframe(7);
    const issues = await this.octokit.paginate(this.octokit.issues.listForRepo, {
      owner: this.project.owner,
      repo: this.project.repo,
      state: 'closed',
      since,
      per_page: PAGE_SIZE,
    });
    return issues.filter((i: any) => !('pull_request' in i));
  }

  private async fetchAllPullRequests(): Promise<any[]> {
    await this.checkRateLimit();
    const prs = await this.octokit.paginate(this.octokit.pulls.list, {
      owner: this.project.owner,
      repo: this.project.repo,
      state: 'all',
      per_page: PAGE_SIZE,
    });
    return prs;
  }

  private async fetchCommits(daysBack: number): Promise<any[]> {
    await this.checkRateLimit();
    const since = this.getTimeframe(daysBack);
    const commits = await this.octokit.paginate(this.octokit.repos.listCommits, {
      owner: this.project.owner,
      repo: this.project.repo,
      since,
      per_page: PAGE_SIZE,
    });
    return commits;
  }

  private async fetchBranches(): Promise<any[]> {
    await this.checkRateLimit();
    const branches = await this.octokit.paginate(this.octokit.repos.listBranches, {
      owner: this.project.owner,
      repo: this.project.repo,
      per_page: PAGE_SIZE,
    });
    return branches;
  }

  private async getDefaultBranch(): Promise<string> {
    await this.checkRateLimit();
    const { data } = await this.octokit.repos.get({
      owner: this.project.owner,
      repo: this.project.repo,
    });
    return data.default_branch;
  }

  private calculateIssuesClosedPerWeek(issues: any[]): number {
    return issues.length;
  }

  private calculateIssueCycleTime(issues: any[]): number | null {
    if (issues.length === 0) return null;

    const totalMs = issues.reduce((sum: number, issue: any) => {
      const created = new Date(issue.created_at).getTime();
      const closed = new Date(issue.closed_at).getTime();
      return sum + (closed - created);
    }, 0);

    const avgMs = totalMs / issues.length;
    return Math.round((avgMs / (24 * 60 * 60 * 1000)) * 10) / 10; // Days
  }

  private async calculateCodeChurn(commits: any[]): Promise<{ filesModifiedGte10Times: number; filesModifiedByGte3People: number }> {
    const fileStats: Map<string, { count: number; authors: Set<string> }> = new Map();

    for (const commit of commits) {
      try {
        await this.checkRateLimit();
        const { data: fullCommit } = await this.octokit.repos.getCommit({
          owner: this.project.owner,
          repo: this.project.repo,
          ref: commit.sha,
        });

        const author = fullCommit.commit.author?.name || 'unknown';
        for (const file of fullCommit.files || []) {
          if (!fileStats.has(file.filename)) {
            fileStats.set(file.filename, { count: 0, authors: new Set() });
          }
          const stats = fileStats.get(file.filename)!;
          stats.count += 1;
          stats.authors.add(author);
        }
      } catch {
        // Skip on error
      }
    }

    let filesModifiedGte10Times = 0;
    let filesModifiedByGte3People = 0;

    for (const stats of fileStats.values()) {
      if (stats.count >= 10) filesModifiedGte10Times += 1;
      if (stats.authors.size >= 3) filesModifiedByGte3People += 1;
    }

    return { filesModifiedGte10Times, filesModifiedByGte3People };
  }

  private calculatePrReviewCoverage(prs: any[]): number {
    if (prs.length === 0) return 0;
    const reviewed = prs.filter((pr: any) => (pr.review_comments || 0) > 0).length;
    return Math.round((reviewed / prs.length) * 100);
  }

  private calculateReviewPerPr(prs: any[]): number {
    if (prs.length === 0) return 0;
    const total = prs.reduce((sum: number, pr: any) => sum + (pr.review_comments || 0), 0);
    return Math.round((total / prs.length) * 10) / 10;
  }

  private calculateSelfMergedPrRate(prs: any[]): number {
    const mergedPrs = prs.filter((pr: any) => pr.merged_at);
    if (mergedPrs.length === 0) return 0;

    const selfMerged = mergedPrs.filter(
      (pr: any) =>
        pr.user?.login === pr.merged_by?.login,
    ).length;

    return Math.round((selfMerged / mergedPrs.length) * 100);
  }

  private async calculateTimeToFirstReview(prs: any[]): Promise<number | null> {
    if (prs.length === 0) return null;

    let totalHours = 0;
    let prWithReviews = 0;

    for (const pr of prs) {
      try {
        await this.checkRateLimit();
        const reviews = await this.octokit.paginate(this.octokit.pulls.listReviews, {
          owner: this.project.owner,
          repo: this.project.repo,
          pull_number: pr.number,
          per_page: PAGE_SIZE,
        });

        const nonAuthorReview = reviews.find(
          (r: any) => r.user?.login !== pr.user?.login && r.submitted_at,
        );

        if (nonAuthorReview) {
          const createdAt = new Date(pr.created_at).getTime();
          const reviewedAt = new Date(nonAuthorReview.submitted_at || new Date()).getTime();
          totalHours += (reviewedAt - createdAt) / (1000 * 60 * 60);
          prWithReviews += 1;
        }
      } catch {
        // Skip on error
      }
    }

    return prWithReviews > 0 ? Math.round(totalHours / prWithReviews) : null;
  }

  private calculateCommitMessageQuality(commits: any[]): {
    withIssueRefPercent: number;
    withBodyPercent: number;
    followingConventionPercent: number;
  } {
    if (commits.length === 0) return { withIssueRefPercent: 0, withBodyPercent: 0, followingConventionPercent: 0 };

    let withIssueRef = 0;
    let withBody = 0;
    let followingConvention = 0;

    for (const commit of commits) {
      const message = commit.commit?.message || '';
      const lines = message.split('\n');
      const firstLine = lines[0];
      const body = lines.slice(1).join('\n').trim();

      // Check issue reference
      if (/#\d+|PROJ-\d+|fixes #\d+/i.test(message)) withIssueRef += 1;

      // Check body
      if (body.length > 0) withBody += 1;

      // Check conventional commit
      if (/^(feat|fix|chore|docs|style|refactor|perf|test)(\(.+\))?:/i.test(firstLine)) {
        followingConvention += 1;
      }
    }

    return {
      withIssueRefPercent: Math.round((withIssueRef / commits.length) * 100),
      withBodyPercent: Math.round((withBody / commits.length) * 100),
      followingConventionPercent: Math.round((followingConvention / commits.length) * 100),
    };
  }

  private calculateStalePrCount(prs: any[]): number {
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return prs.filter(
      (pr: any) => pr.state === 'open' && new Date(pr.updated_at).getTime() < twoWeeksAgo,
    ).length;
  }

  private calculateLongLivedBranches(branches: any[], defaultBranch: string): number {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return branches.filter((branch: any) => {
      if (branch.name === defaultBranch) return false;
      const commitDate = branch.commit?.committed_date || branch.commit?.date || new Date().toISOString();
      const lastCommitDate = new Date(commitDate).getTime();
      return lastCommitDate < thirtyDaysAgo;
    }).length;
  }

  private calculateBusFactor(commits: any[]): number {
    if (commits.length === 0) return 0;

    const authorCounts: Map<string, number> = new Map();
    for (const commit of commits) {
      const author = commit.commit?.author?.name || commit.author?.login || 'unknown';
      authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
    }

    const sortedAuthors = Array.from(authorCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    let cumulativePercent = 0;
    for (let i = 0; i < sortedAuthors.length; i++) {
      const percent = (sortedAuthors[i]?.[1] ?? 0 / commits.length) * 100;
      cumulativePercent += percent;
      if (cumulativePercent >= 50) return i + 1;
    }

    return sortedAuthors.length;
  }

  private async calculateCodeOwnershipConcentration(
    commits: any[],
  ): Promise<{ directories: Array<{ path: string; topContributorPercent: number; isFlagged: boolean }> }> {
    const dirStats: Map<string, Map<string, number>> = new Map();

    for (const commit of commits) {
      try {
        await this.checkRateLimit();
        const { data: fullCommit } = await this.octokit.repos.getCommit({
          owner: this.project.owner,
          repo: this.project.repo,
          ref: commit.sha,
        });

        const author = fullCommit.commit.author?.name || 'unknown';
        for (const file of fullCommit.files || []) {
          const dirMatch = file.filename.match(/^[^/]+/);
          const dir = dirMatch ? dirMatch[0] : 'root';

          if (!dirStats.has(dir)) {
            dirStats.set(dir, new Map());
          }
          const authors = dirStats.get(dir)!;
          authors.set(author, (authors.get(author) || 0) + 1);
        }
      } catch {
        // Skip on error
      }
    }

    const directories: Array<{ path: string; topContributorPercent: number; isFlagged: boolean }> = [];

    for (const [dir, authors] of dirStats.entries()) {
      const totalCommits = Array.from(authors.values()).reduce((a, b) => a + b, 0);
      const topContributorCommits = Math.max(...authors.values());
      const percent = Math.round((topContributorCommits / totalCommits) * 100);

      directories.push({
        path: dir,
        topContributorPercent: percent,
        isFlagged: percent > 60,
      });
    }

    return { directories };
  }

  private calculateActiveContributionsPerWeek(
    commits: any[],
    prs: any[],
    issues: any[],
  ): number {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const contributors = new Set<string>();

    // From commits
    for (const commit of commits) {
      if (new Date(commit.commit.author.date).getTime() > oneWeekAgo) {
        contributors.add(commit.commit.author.name || commit.author?.login || 'unknown');
      }
    }

    // From PRs
    for (const pr of prs) {
      if (new Date(pr.created_at).getTime() > oneWeekAgo) {
        contributors.add(pr.user?.login || 'unknown');
      }
    }

    // From issues
    for (const issue of issues) {
      if (new Date(issue.created_at).getTime() > oneWeekAgo) {
        contributors.add(issue.user?.login || 'unknown');
      }
    }

    return contributors.size;
  }

  private calculateReviewNetworkDensity(prs: any[]): number {
    const pairs = new Set<string>();
    const authors = new Set<string>();

    for (const pr of prs) {
      const author = pr.user?.login;
      if (author) {
        authors.add(author);
        // Review comments indicate reviewers
        if ((pr.review_comments || 0) > 0) {
          pairs.add(`${author}-reviewed`);
        }
      }
    }

    const n = authors.size;
    const possiblePairs = n * (n - 1);
    return possiblePairs > 0 ? Math.round((pairs.size / possiblePairs) * 100) / 100 : 0;
  }

  private calculatePrRevertRate(prs: any[]): number {
    const mergedPrs = prs.filter((pr: any) => pr.merged_at);
    if (mergedPrs.length === 0) return 0;

    // A PR is considered reverted if there's a revert commit referencing it
    let revertedCount = 0;
    for (const pr of mergedPrs) {
      // Simple heuristic: check if PR title contains "revert"
      if (/revert/i.test(pr.title)) {
        revertedCount += 1;
      }
    }

    return Math.round((revertedCount / mergedPrs.length) * 100);
  }

  private async calculateDependencyUpdateLag(): Promise<number | null> {
    // Placeholder: would require parsing package.json and querying npm registry
    // This is complex and requires external API calls
    return null;
  }
}
