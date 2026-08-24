/**
 * GitHub VCS Connector Implementation
 */

import { Octokit } from '@octokit/rest';
import { IVcsConnector, VcsConnectorOutput } from '../connector.interface.js';
import { CreateVcsConnectorInput, VcsConnectorOptions } from '../types.js';
import { GitHubMetricsResponse } from '../github-metrics.types.js';
import type { IConnector } from '@libs/sync/index.js';

const RATE_LIMIT_THRESHOLD = 100;
const RATE_LIMIT_PAUSE_MS = 60_000;
const PAGE_SIZE = 100;
const DEFAULT_COMMIT_WINDOW_DAYS = 30;
const DEFAULT_GRAPHQL_PAGE_SIZE = 50;
const DEFAULT_GRAPHQL_REVIEWS_PAGE_SIZE = 50;
const DEFAULT_GRAPHQL_THREADS_PAGE_SIZE = 100;
const DEFAULT_GRAPHQL_LABELS_PAGE_SIZE = 20;
const DEFAULT_LONG_LIVED_BRANCH_THRESHOLD_DAYS = 30;

const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;
const BUG_VS_FEATURE_COVERAGE_THRESHOLD_PERCENT = 50;
const BUG_LABEL_PATTERNS = [/bug/i, /defect/i, /error/i, /type:\s*bug/i, /kind\/bug/i];
const FEATURE_LABEL_PATTERNS = [/feature/i, /enhancement/i, /\bfeat\b/i, /improvement/i, /type:\s*feature/i, /story/i];

const PULL_REQUESTS_WITH_REVIEWS_QUERY = `
	query($owner: String!, $repo: String!, $cursor: String, $pageSize: Int!, $reviewsPageSize: Int!, $threadsPageSize: Int!) {
		rateLimit {
			remaining
			resetAt
		}
		repository(owner: $owner, name: $repo) {
			pullRequests(first: $pageSize, after: $cursor, orderBy: { field: CREATED_AT, direction: DESC }) {
				pageInfo {
					hasNextPage
					endCursor
				}
				nodes {
					number
					title
					state
					createdAt
					updatedAt
					mergedAt
					additions
					deletions
					author {
						login
					}
					mergedBy {
						login
					}
					reviews(first: $reviewsPageSize) {
						nodes {
							submittedAt
							author {
								login
							}
							comments {
								totalCount
							}
						}
					}
					reviewThreads(first: $threadsPageSize) {
						nodes {
							isResolved
						}
					}
				}
			}
		}
	}
`;

const BRANCHES_GRAPHQL_QUERY = `
	query($owner: String!, $repo: String!, $cursor: String, $pageSize: Int!) {
		rateLimit {
			remaining
			resetAt
		}
		repository(owner: $owner, name: $repo) {
			refs(refPrefix: "refs/heads/", first: $pageSize, after: $cursor) {
				pageInfo {
					hasNextPage
					endCursor
				}
				nodes {
					name
					target {
						... on Commit {
							committedDate
						}
					}
				}
			}
		}
	}
`;

type JavaDependency = { groupId: string; artifactId: string; version: string };

const ISSUES_GRAPHQL_QUERY = `
	query($owner: String!, $repo: String!, $cursor: String, $pageSize: Int!, $labelsPageSize: Int!) {
		rateLimit {
			remaining
			resetAt
		}
		repository(owner: $owner, name: $repo) {
			issues(first: $pageSize, after: $cursor, orderBy: { field: CREATED_AT, direction: DESC }) {
				pageInfo {
					hasNextPage
					endCursor
				}
				nodes {
					number
					state
					updatedAt
					labels(first: $labelsPageSize) {
						nodes {
							name
						}
					}
					timelineItems(itemTypes: [REOPENED_EVENT], first: 1) {
						totalCount
					}
				}
			}
		}
	}
`;

export class GitHubConnector implements IVcsConnector<GitHubMetricsResponse>, IConnector {
	private credentials: { token: string };
	private project: { owner: string; repo: string };
	private octokit: Octokit;
	private options: Required<VcsConnectorOptions>;

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
		this.options = {
			commitWindowDays: input.options?.commitWindowDays ?? DEFAULT_COMMIT_WINDOW_DAYS,
			graphqlPageSize: input.options?.graphqlPageSize ?? DEFAULT_GRAPHQL_PAGE_SIZE,
			reviewsPageSize: input.options?.reviewsPageSize ?? DEFAULT_GRAPHQL_REVIEWS_PAGE_SIZE,
			threadsPageSize: input.options?.threadsPageSize ?? DEFAULT_GRAPHQL_THREADS_PAGE_SIZE,
			labelsPageSize: input.options?.labelsPageSize ?? DEFAULT_GRAPHQL_LABELS_PAGE_SIZE,
			longLivedBranchThresholdDays:
				input.options?.longLivedBranchThresholdDays ?? DEFAULT_LONG_LIVED_BRANCH_THRESHOLD_DAYS,
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

	private async checkGraphQLRateLimit(rateLimit: { remaining: number; resetAt: string }): Promise<void> {
		if (!rateLimit) return;
		if (rateLimit.remaining < RATE_LIMIT_THRESHOLD) {
			const resetAt = new Date(rateLimit.resetAt).getTime();
			const waitMs = Math.max(resetAt - Date.now(), RATE_LIMIT_PAUSE_MS);
			await new Promise((resolve) => setTimeout(resolve, waitMs));
		}
	}

	private getTimeframe(days: number): string {
		return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
	}

	async getData(): Promise<VcsConnectorOutput<GitHubMetricsResponse>> {
		const { owner, repo } = this.project;
		const now = new Date();

		const [issues, reviewPrs, graphqlIssues, commits, branches, defaultBranch] = await Promise.all([
			this.fetchClosedIssues(),
			this.fetchPullRequestsWithReviews(),
			this.fetchAllIssuesGraphQL(),
			this.fetchCommits(this.options.commitWindowDays),
			this.fetchBranchesGraphQL(),
			this.getDefaultBranch(),
		]);

		const issuesClosedPerWeek = this.calculateIssuesClosedPerWeek(issues);
		const issueCycleTimeAvgDays = this.calculateIssueCycleTime(issues);
		const issueReopenRatePercent = this.calculateIssueReopenRate(graphqlIssues);
		const bugVsFeatureRatio = this.calculateBugVsFeatureRatio(graphqlIssues);
		const codeChurn = await this.calculateCodeChurn(commits);
		const prReviewCoverage = this.calculatePrReviewCoverage(reviewPrs);
		const reviewIterationCountAvg = this.calculateReviewIterationCount(reviewPrs);
		const selfMergedPrRate = this.calculateSelfMergedPrRate(reviewPrs);
		const timeToFirstReview = this.calculateTimeToFirstReview(reviewPrs);
		const prsMergedPerWeek = this.calculatePrsMergedPerWeek(reviewPrs);
		const prMergeTimeAvgHours = this.calculatePrMergeTime(reviewPrs);
		const reviewCommentsPerPrAvg = this.calculateReviewCommentsPerPr(reviewPrs);
		const unresolvedDiscussionThreadsAtMergeCount =
			this.calculateUnresolvedDiscussionThreads(reviewPrs);
		const reviewCommentsPer100LinesAvg = this.calculateReviewCommentsPer100Lines(reviewPrs);
		const commitMessageQuality = this.calculateCommitMessageQuality(commits);
		const stalePrCount = this.calculateStalePrCount(reviewPrs);
		const staleIssuesCount = this.calculateStaleIssuesCount(graphqlIssues);
		const longLivedBranches = await this.calculateLongLivedBranches(branches, defaultBranch);
		const busFactor = this.calculateBusFactor(commits);
		const codeOwnershipConcentration = await this.calculateCodeOwnershipConcentration(
			commits,
		);
		const activeContributionsPerWeek = this.calculateActiveContributionsPerWeek(
			commits,
			reviewPrs,
			issues,
		);
		const reviewNetworkDensity = this.calculateReviewNetworkDensity(reviewPrs);
		const prRevertRate = this.calculatePrRevertRate(reviewPrs);
		const securityVulnerabilityCount = await this.calculateSecurityVulnerabilityCount();
		const dependencyUpdateLag = await this.calculateDependencyUpdateLag(defaultBranch);

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
				issueReopenRatePercent,
				bugVsFeatureRatio,
				prsMergedPerWeek,
				prMergeTimeAvgHours,
				timeToFirstReviewAvgHours: timeToFirstReview,
				reviewCommentsPerPrAvg,
				prRevertRatePercent: prRevertRate,
				codeChurn,
				commitMessageQuality,
				unresolvedDiscussionThreadsAtMergeCount,
				reviewCommentsPer100LinesAvg,
				busFactor,
				codeOwnershipConcentration,
				reviewNetworkDensity,
				securityVulnerabilityCount,
				staleIssuesCount,
				stalePrCount,
				reviewIterationCountAvg,
				prReviewCoveragePercent: prReviewCoverage,
				selfMergedPrRatePercent: selfMergedPrRate,
				longLivedBranchesCount: longLivedBranches,
				activeContributionsPerWeek,
				dependencyUpdateLagAvgDays: dependencyUpdateLag,
			},
		};

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

	private async fetchBranchesGraphQL(): Promise<any[]> {
		const { owner, repo } = this.project;
		const branches: any[] = [];
		let cursor: string | null = null;
		let hasNextPage = true;

		while (hasNextPage) {
			const response: any = await this.octokit.graphql(BRANCHES_GRAPHQL_QUERY, {
				owner,
				repo,
				cursor,
				pageSize: this.options.graphqlPageSize,
			});

			await this.checkGraphQLRateLimit(response.rateLimit);

			const connection = response.repository.refs;
			for (const node of connection.nodes) {
				branches.push({
					name: node.name,
					lastCommitDate: node.target?.committedDate ?? null,
				});
			}

			hasNextPage = connection.pageInfo.hasNextPage;
			cursor = connection.pageInfo.endCursor;
		}

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

	private async fetchPullRequestsWithReviews(): Promise<any[]> {
		const { owner, repo } = this.project;
		const prs: any[] = [];
		let cursor: string | null = null;
		let hasNextPage = true;

		while (hasNextPage) {
			const response: any = await this.octokit.graphql(PULL_REQUESTS_WITH_REVIEWS_QUERY, {
				owner,
				repo,
				cursor,
				pageSize: this.options.graphqlPageSize,
				reviewsPageSize: this.options.reviewsPageSize,
				threadsPageSize: this.options.threadsPageSize,
			});

			await this.checkGraphQLRateLimit(response.rateLimit);

			const connection = response.repository.pullRequests;
			for (const node of connection.nodes) {
				const reviewNodes = node.reviews?.nodes ?? [];
				const threadNodes = node.reviewThreads?.nodes ?? [];

				prs.push({
					number: node.number,
					title: node.title,
					state: node.state,
					authorLogin: node.author?.login ?? null,
					createdAt: node.createdAt,
					updatedAt: node.updatedAt,
					mergedAt: node.mergedAt,
					mergedByLogin: node.mergedBy?.login ?? null,
					additions: node.additions ?? 0,
					deletions: node.deletions ?? 0,
					reviewCommentsCount: reviewNodes.reduce(
						(sum: number, r: any) => sum + (r.comments?.totalCount ?? 0),
						0,
					),
					unresolvedThreadCount: threadNodes.filter((t: any) => !t.isResolved).length,
					reviews: reviewNodes.map((r: any) => ({
						authorLogin: r.author?.login ?? null,
						submittedAt: r.submittedAt,
					})),
				});
			}

			hasNextPage = connection.pageInfo.hasNextPage;
			cursor = connection.pageInfo.endCursor;
		}

		return prs;
	}

	private async fetchAllIssuesGraphQL(): Promise<any[]> {
		const { owner, repo } = this.project;
		const issues: any[] = [];
		let cursor: string | null = null;
		let hasNextPage = true;

		while (hasNextPage) {
			const response: any = await this.octokit.graphql(ISSUES_GRAPHQL_QUERY, {
				owner,
				repo,
				cursor,
				pageSize: this.options.graphqlPageSize,
				labelsPageSize: this.options.labelsPageSize,
			});

			await this.checkGraphQLRateLimit(response.rateLimit);

			const connection = response.repository.issues;
			for (const node of connection.nodes) {
				issues.push({
					number: node.number,
					state: node.state,
					updatedAt: node.updatedAt,
					labels: (node.labels?.nodes ?? []).map((l: any) => l.name),
					reopenedCount: node.timelineItems?.totalCount ?? 0,
				});
			}

			hasNextPage = connection.pageInfo.hasNextPage;
			cursor = connection.pageInfo.endCursor;
		}

		return issues;
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
		return Math.round((avgMs / (24 * 60 * 60 * 1000)) * 10) / 10;
	}

	private async calculateCodeChurn(
		commits: any[],
	): Promise<{ filesModifiedGte10Times: number; filesModifiedByGte3People: number }> {
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

		let reviewed = 0;
		for (const pr of prs) {
			const hasNonAuthorReview = pr.reviews.some(
				(r: any) => r.authorLogin && r.authorLogin !== pr.authorLogin,
			);

			if (hasNonAuthorReview) reviewed += 1;
		}

		return Math.round((reviewed / prs.length) * 100);
	}

	private calculateReviewIterationCount(prs: any[]): number {
		if (prs.length === 0) return 0;

		let total = 0;
		for (const pr of prs) {
			const nonAuthorReviews = pr.reviews.filter(
				(r: any) => r.authorLogin && r.authorLogin !== pr.authorLogin,
			);

			total += nonAuthorReviews.length;
		}

		return Math.round((total / prs.length) * 10) / 10;
	}

	private calculateSelfMergedPrRate(prs: any[]): number {
		const mergedPrs = prs.filter((pr: any) => pr.mergedAt);
		if (mergedPrs.length === 0) return 0;

		let selfMerged = 0;
		for (const pr of mergedPrs) {
			if (pr.authorLogin && pr.mergedByLogin && pr.authorLogin === pr.mergedByLogin) {
				selfMerged += 1;
			}
		}

		return Math.round((selfMerged / mergedPrs.length) * 100);
	}

	private calculateTimeToFirstReview(prs: any[]): number | null {
		if (prs.length === 0) return null;

		let totalHours = 0;
		let prWithReviews = 0;

		for (const pr of prs) {
			const nonAuthorReview = pr.reviews.find(
				(r: any) => r.authorLogin !== pr.authorLogin && r.submittedAt,
			);

			if (nonAuthorReview) {
				const createdAt = new Date(pr.createdAt).getTime();
				const reviewedAt = new Date(nonAuthorReview.submittedAt).getTime();
				totalHours += (reviewedAt - createdAt) / (1000 * 60 * 60);
				prWithReviews += 1;
			}
		}

		return prWithReviews > 0 ? Math.round(totalHours / prWithReviews) : null;
	}

	private calculateCommitMessageQuality(commits: any[]): {
		withIssueRefPercent: number;
		withBodyPercent: number;
		followingConventionPercent: number;
	} {
		if (commits.length === 0) {
			return { withIssueRefPercent: 0, withBodyPercent: 0, followingConventionPercent: 0 };
		}

		let withIssueRef = 0;
		let withBody = 0;
		let followingConvention = 0;

		for (const commit of commits) {
			const message = commit.commit?.message || '';
			const lines = message.split('\n');
			const firstLine = lines[0];
			const body = lines.slice(1).join('\n').trim();

			if (/#\d+|PROJ-\d+|fixes #\d+/i.test(message)) withIssueRef += 1;
			if (body.length > 0) withBody += 1;
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
			(pr: any) => pr.state === 'OPEN' && new Date(pr.updatedAt).getTime() < twoWeeksAgo,
		).length;
	}

	// ahead_by === 0 means every commit on the branch is already reachable from
	// defaultBranch — i.e. it's fully merged, just not deleted yet. On failure
	// (e.g. branch/network issue) we don't assume it's merged, so it still counts.
	private async isBranchMerged(branchName: string, defaultBranch: string): Promise<boolean> {
		try {
			await this.checkRateLimit();
			const { data } = await this.octokit.repos.compareCommitsWithBasehead({
				owner: this.project.owner,
				repo: this.project.repo,
				basehead: `${defaultBranch}...${branchName}`,
			});
			return data.ahead_by === 0;
		} catch {
			return false;
		}
	}

	private async calculateLongLivedBranches(branches: any[], defaultBranch: string): Promise<number> {
		const threshold = Date.now() - this.options.longLivedBranchThresholdDays * 24 * 60 * 60 * 1000;

		const staleCandidates = branches.filter((branch: any) => {
			if (branch.name === defaultBranch) return false;
			if (!branch.lastCommitDate) return false;
			return new Date(branch.lastCommitDate).getTime() < threshold;
		});

		const mergedFlags = await Promise.all(
			staleCandidates.map((branch: any) => this.isBranchMerged(branch.name, defaultBranch)),
		);

		return staleCandidates.filter((_, i) => !mergedFlags[i]).length;
	}

	private calculateBusFactor(commits: any[]): number {
		if (commits.length === 0) return 0;

		const authorCounts: Map<string, number> = new Map();
		for (const commit of commits) {
			const author = commit.commit?.author?.name || commit.author?.login || 'unknown';
			authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
		}

		const sortedAuthors = Array.from(authorCounts.entries()).sort((a, b) => b[1] - a[1]);

		let cumulativePercent = 0;
		for (let i = 0; i < sortedAuthors.length; i++) {
			const commitCount = sortedAuthors[i]?.[1] ?? 0;
			const percent = (commitCount / commits.length) * 100;
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
					const slashIndex = file.filename.indexOf('/');
					const dir = slashIndex === -1 ? 'root' : file.filename.slice(0, slashIndex);

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

		const directories: Array<{
			path: string;
			topContributorPercent: number;
			isFlagged: boolean;
		}> = [];

		for (const [dir, authors] of dirStats.entries()) {
			const totalCommits = Array.from(authors.values()).reduce((a, b) => a + b, 0);
			if (totalCommits === 0) continue;

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

		for (const commit of commits) {
			if (new Date(commit.commit.author.date).getTime() > oneWeekAgo) {
				contributors.add(commit.commit.author.name || commit.author?.login || 'unknown');
			}
		}

		for (const pr of prs) {
			if (new Date(pr.createdAt).getTime() > oneWeekAgo) {
				contributors.add(pr.authorLogin || 'unknown');
			}
		}

		for (const issue of issues) {
			if (new Date(issue.created_at).getTime() > oneWeekAgo) {
				contributors.add(issue.user?.login || 'unknown');
			}
		}

		return contributors.size;
	}

	private calculateReviewNetworkDensity(prs: any[]): number {
		const participants = new Set<string>();
		const edges = new Set<string>();

		for (const pr of prs) {
			const authorLogin = pr.authorLogin;
			if (!authorLogin) continue;
			participants.add(authorLogin);

			for (const review of pr.reviews ?? []) {
				const reviewerLogin = review.authorLogin;
				if (!reviewerLogin || reviewerLogin === authorLogin) continue;

				participants.add(reviewerLogin);
				edges.add(`${reviewerLogin}->${authorLogin}`);
			}
		}

		const n = participants.size;
		const possibleEdges = n * (n - 1);
		return possibleEdges > 0 ? Math.round((edges.size / possibleEdges) * 100) / 100 : 0;
	}

	private calculatePrRevertRate(prs: any[]): number {
		const mergedPrs = prs.filter((pr: any) => pr.mergedAt);
		if (mergedPrs.length === 0) return 0;

		let revertedCount = 0;
		for (const pr of mergedPrs) {
			if (/revert/i.test(pr.title)) {
				revertedCount += 1;
			}
		}

		return Math.round((revertedCount / mergedPrs.length) * 100);
	}

	// Vendor/build directories are excluded since a committed one (accidentally
	// or otherwise) would otherwise flood results with manifests that aren't this project's own
	private static readonly VENDOR_DIR_PATTERN =
		/(^|\/)(node_modules|vendor|\.venv|venv|dist|build|target|\.gradle)\//;

	private async findManifestPaths(filenames: string[], treeSha: string): Promise<string[]> {
		try {
			await this.checkRateLimit();
			const { data } = await this.octokit.git.getTree({
				owner: this.project.owner,
				repo: this.project.repo,
				tree_sha: treeSha,
				recursive: 'true',
			});

			return (data.tree ?? [])
				.filter(
					(entry: any) =>
						entry.type === 'blob' &&
						typeof entry.path === 'string' &&
						filenames.includes(entry.path.split('/').pop()) &&
						!GitHubConnector.VENDOR_DIR_PATTERN.test(entry.path),
				)
				.map((entry: any) => entry.path as string);
		} catch {
			return [];
		}
	}

	private async fetchPackageManifestAt(path: string): Promise<{
		dependencies: Record<string, string>;
		devDependencies: Record<string, string>;
	} | null> {
		try {
			await this.checkRateLimit();
			const { data } = await this.octokit.repos.getContent({
				owner: this.project.owner,
				repo: this.project.repo,
				path,
			});

			if (Array.isArray(data) || data.type !== 'file' || !data.content) return null;

			const content = Buffer.from(data.content, 'base64').toString('utf-8');
			const parsed = JSON.parse(content);

			return {
				dependencies: parsed.dependencies ?? {},
				devDependencies: parsed.devDependencies ?? {},
			};
		} catch {
			return null;
		}
	}

	// Only accepts an exact semver (e.g. "1.2.3", from "^1.2.3"/"~1.2.3") — ranges, tags
	// ("latest", "workspace:*") and git/URL specifiers aren't resolvable without a lockfile
	private extractPinnedVersion(versionSpec: string): string | null {
		const cleaned = versionSpec.trim().replace(/^[\^~>=<]+/, '');
		return /^\d+\.\d+\.\d+/.test(cleaned) ? cleaned : null;
	}

	private async fetchDependencyLagDays(packageName: string, currentVersion: string): Promise<number | null> {
		try {
			const response = await fetch(`https://registry.npmjs.org/${packageName}`);
			if (!response.ok) return null;

			const data: any = await response.json();
			const latestVersion = data['dist-tags']?.latest;
			const times = data.time ?? {};

			const currentPublishedAt = times[currentVersion];
			const latestPublishedAt = latestVersion ? times[latestVersion] : null;
			if (!currentPublishedAt || !latestPublishedAt) return null;

			const lagMs = new Date(latestPublishedAt).getTime() - new Date(currentPublishedAt).getTime();
			return lagMs > 0 ? lagMs / (24 * 60 * 60 * 1000) : 0;
		} catch {
			return null;
		}
	}

	// Only "==" pins resolve to a concrete version — ranges (">=", "~="), unpinned
	// entries, and options/comments/blank lines are skipped, same policy as npm's extractPinnedVersion
	private async fetchRequirementsTxtAt(path: string): Promise<Record<string, string> | null> {
		try {
			await this.checkRateLimit();
			const { data } = await this.octokit.repos.getContent({
				owner: this.project.owner,
				repo: this.project.repo,
				path,
			});

			if (Array.isArray(data) || data.type !== 'file' || !data.content) return null;

			const content = Buffer.from(data.content, 'base64').toString('utf-8');
			const dependencies: Record<string, string> = {};

			for (const rawLine of content.split('\n')) {
				const line = rawLine.split('#')[0]?.trim() ?? '';
				if (!line || line.startsWith('-')) continue;

				const match = line.match(/^([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*==\s*([0-9][^\s;]*)/);
				if (match?.[1] && match[2]) {
					dependencies[match[1]] = match[2];
				}
			}

			return dependencies;
		} catch {
			return null;
		}
	}

	private async fetchPyPiDependencyLagDays(packageName: string, currentVersion: string): Promise<number | null> {
		try {
			const response = await fetch(`https://pypi.org/pypi/${packageName}/json`);
			if (!response.ok) return null;

			const data: any = await response.json();
			const latestVersion = data.info?.version;
			const releases = data.releases ?? {};

			const currentPublishedAt = releases[currentVersion]?.[0]?.upload_time_iso_8601;
			const latestPublishedAt = latestVersion ? releases[latestVersion]?.[0]?.upload_time_iso_8601 : null;
			if (!currentPublishedAt || !latestPublishedAt) return null;

			const lagMs = new Date(latestPublishedAt).getTime() - new Date(currentPublishedAt).getTime();
			return lagMs > 0 ? lagMs / (24 * 60 * 60 * 1000) : 0;
		} catch {
			return null;
		}
	}

	// Skips versions we can't resolve to a literal: Maven property placeholders
	// ("${spring.version}") and dependencies with no explicit <version> (inherited from a parent/BOM)
	private async fetchPomXmlAt(path: string): Promise<JavaDependency[] | null> {
		try {
			await this.checkRateLimit();
			const { data } = await this.octokit.repos.getContent({
				owner: this.project.owner,
				repo: this.project.repo,
				path,
			});

			if (Array.isArray(data) || data.type !== 'file' || !data.content) return null;

			const content = Buffer.from(data.content, 'base64').toString('utf-8');
			const dependencies: JavaDependency[] = [];

			const depBlocks = content.match(/<dependency>[\s\S]*?<\/dependency>/g) ?? [];
			for (const block of depBlocks) {
				const groupId = block.match(/<groupId>([^<]+)<\/groupId>/)?.[1]?.trim();
				const artifactId = block.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1]?.trim();
				const version = block.match(/<version>([^<]+)<\/version>/)?.[1]?.trim();

				if (!groupId || !artifactId || !version) continue;
				if (version.includes('${') || !/^\d/.test(version)) continue;

				dependencies.push({ groupId, artifactId, version });
			}

			return dependencies;
		} catch {
			return null;
		}
	}

	// Best-effort regex over the common Groovy/Kotlin DSL dependency declaration shapes
	// (implementation("group:artifact:version") / implementation 'group:artifact:version').
	// Map-style declarations (group: 'x', name: 'y', version: 'z') and version-catalog
	// references (libs.someLib) aren't matched — same "majority case, not exhaustive" tradeoff as elsewhere.
	private static readonly GRADLE_DEPENDENCY_PATTERN =
		/(?:implementation|api|compile|testImplementation|testCompile|runtimeOnly|compileOnly|annotationProcessor)\s*[( ]\s*['"]([^:'"]+):([^:'"]+):([^:'")]+)['"]/g;

	private async fetchGradleDependenciesAt(path: string): Promise<JavaDependency[] | null> {
		try {
			await this.checkRateLimit();
			const { data } = await this.octokit.repos.getContent({
				owner: this.project.owner,
				repo: this.project.repo,
				path,
			});

			if (Array.isArray(data) || data.type !== 'file' || !data.content) return null;

			const content = Buffer.from(data.content, 'base64').toString('utf-8');
			const dependencies: JavaDependency[] = [];

			for (const match of content.matchAll(GitHubConnector.GRADLE_DEPENDENCY_PATTERN)) {
				const [, groupId, artifactId, version] = match;
				if (!groupId || !artifactId || !version) continue;
				if (version.includes('$') || !/^\d/.test(version)) continue;

				dependencies.push({ groupId, artifactId, version });
			}

			return dependencies;
		} catch {
			return null;
		}
	}

	// Fetches the whole gav version history in one request (like the npm/PyPI lookups) rather
	// than a separate "latest" query, then finds our version's timestamp and the max timestamp ourselves —
	// avoids depending on an undocumented sort order from Maven Central's search API
	private async fetchMavenDependencyLagDays(
		groupId: string,
		artifactId: string,
		currentVersion: string,
	): Promise<number | null> {
		try {
			const query = encodeURIComponent(`g:"${groupId}" AND a:"${artifactId}"`);
			const response = await fetch(
				`https://search.maven.org/solrsearch/select?q=${query}&core=gav&rows=200&wt=json`,
			);
			if (!response.ok) return null;

			const data: any = await response.json();
			const docs: any[] = data.response?.docs ?? [];
			if (docs.length === 0) return null;

			const currentTimestamp = docs.find((doc: any) => doc.v === currentVersion)?.timestamp;
			const latestTimestamp = Math.max(...docs.map((doc: any) => doc.timestamp ?? 0));
			if (!currentTimestamp || !latestTimestamp) return null;

			const lagMs = latestTimestamp - currentTimestamp;
			return lagMs > 0 ? lagMs / (24 * 60 * 60 * 1000) : 0;
		} catch {
			return null;
		}
	}

	private async calculateDependencyUpdateLag(defaultBranch: string): Promise<number | null> {
		const [npmManifestPaths, pythonManifestPaths, pomManifestPaths, gradleManifestPaths] =
			await Promise.all([
				this.findManifestPaths(['package.json'], defaultBranch),
				this.findManifestPaths(['requirements.txt'], defaultBranch),
				this.findManifestPaths(['pom.xml'], defaultBranch),
				this.findManifestPaths(['build.gradle', 'build.gradle.kts'], defaultBranch),
			]);

		const [npmManifests, pythonManifests, pomManifests, gradleManifests] = await Promise.all([
			Promise.all(npmManifestPaths.map((path) => this.fetchPackageManifestAt(path))),
			Promise.all(pythonManifestPaths.map((path) => this.fetchRequirementsTxtAt(path))),
			Promise.all(pomManifestPaths.map((path) => this.fetchPomXmlAt(path))),
			Promise.all(gradleManifestPaths.map((path) => this.fetchGradleDependenciesAt(path))),
		]);

		const lagDaysPromises: Promise<number | null>[] = [];

		for (const manifest of npmManifests) {
			if (!manifest) continue;
			const allNpmDeps = { ...manifest.dependencies, ...manifest.devDependencies };
			for (const [name, versionSpec] of Object.entries(allNpmDeps)) {
				const version = this.extractPinnedVersion(versionSpec);
				if (version) lagDaysPromises.push(this.fetchDependencyLagDays(name, version));
			}
		}

		for (const manifest of pythonManifests) {
			if (!manifest) continue;
			for (const [name, version] of Object.entries(manifest)) {
				lagDaysPromises.push(this.fetchPyPiDependencyLagDays(name, version));
			}
		}

		for (const deps of [...pomManifests, ...gradleManifests]) {
			if (!deps) continue;
			for (const { groupId, artifactId, version } of deps) {
				lagDaysPromises.push(this.fetchMavenDependencyLagDays(groupId, artifactId, version));
			}
		}

		if (lagDaysPromises.length === 0) return null;

		const lagDaysResults = await Promise.all(lagDaysPromises);
		const lagDaysList = lagDaysResults.filter((d): d is number => d !== null);
		if (lagDaysList.length === 0) return null;

		const avgLagDays = lagDaysList.reduce((sum, d) => sum + d, 0) / lagDaysList.length;
		return Math.round(avgLagDays * 10) / 10;
	}

	private calculateIssueReopenRate(issues: any[]): number | null {
		if (issues.length === 0) return null;
		const reopened = issues.filter((issue: any) => issue.reopenedCount > 0).length;
		return Math.round((reopened / issues.length) * 100);
	}

	private calculateBugVsFeatureRatio(
		issues: any[],
	): GitHubMetricsResponse['metrics']['bugVsFeatureRatio'] {
		const totalIssues = issues.length;
		if (totalIssues === 0) {
			return { bugCount: 0, featureCount: 0, totalIssues: 0, classificationCoveragePercent: 0, ratio: null };
		}

		let bugCount = 0;
		let featureCount = 0;

		for (const issue of issues) {
			const labels: string[] = issue.labels ?? [];
			const isBug = labels.some((label) => BUG_LABEL_PATTERNS.some((p) => p.test(label)));
			const isFeature = labels.some((label) => FEATURE_LABEL_PATTERNS.some((p) => p.test(label)));

			if (isBug) bugCount += 1;
			else if (isFeature) featureCount += 1;
		}

		const classificationCoveragePercent = Math.round(
			((bugCount + featureCount) / totalIssues) * 100,
		);
		const meetsCoverageThreshold =
			classificationCoveragePercent >= BUG_VS_FEATURE_COVERAGE_THRESHOLD_PERCENT;
		const ratio =
			meetsCoverageThreshold && featureCount > 0
				? Math.round((bugCount / featureCount) * 100) / 100
				: null;

		return { bugCount, featureCount, totalIssues, classificationCoveragePercent, ratio };
	}

	private calculatePrsMergedPerWeek(prs: any[]): number {
		const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		return prs.filter(
			(pr: any) => pr.mergedAt && new Date(pr.mergedAt).getTime() > oneWeekAgo,
		).length;
	}

	private calculatePrMergeTime(prs: any[]): number | null {
		const mergedPrs = prs.filter((pr: any) => pr.mergedAt);
		if (mergedPrs.length === 0) return null;

		const totalHours = mergedPrs.reduce((sum: number, pr: any) => {
			const created = new Date(pr.createdAt).getTime();
			const merged = new Date(pr.mergedAt).getTime();
			return sum + (merged - created) / (1000 * 60 * 60);
		}, 0);

		return Math.round(totalHours / mergedPrs.length);
	}

	private calculateReviewCommentsPerPr(prs: any[]): number | null {
		if (prs.length === 0) return null;
		const total = prs.reduce((sum: number, pr: any) => sum + (pr.reviewCommentsCount ?? 0), 0);
		return Math.round((total / prs.length) * 10) / 10;
	}

	private calculateUnresolvedDiscussionThreads(prs: any[]): number | null {
		const mergedPrs = prs.filter((pr: any) => pr.mergedAt);
		if (mergedPrs.length === 0) return null;
		return mergedPrs.reduce((sum: number, pr: any) => sum + (pr.unresolvedThreadCount ?? 0), 0);
	}

	private calculateReviewCommentsPer100Lines(prs: any[]): number | null {
		const eligiblePrs = prs.filter((pr: any) => (pr.additions ?? 0) + (pr.deletions ?? 0) > 0);
		if (eligiblePrs.length === 0) return null;

		const ratios = eligiblePrs.map((pr: any) => {
			const linesChanged = pr.additions + pr.deletions;
			return ((pr.reviewCommentsCount ?? 0) / linesChanged) * 100;
		});

		const avgRatio = ratios.reduce((sum: number, r: number) => sum + r, 0) / ratios.length;
		return Math.round(avgRatio * 100) / 100;
	}

	private async fetchDependabotAlertCount(): Promise<number | null> {
		try {
			await this.checkRateLimit();
			const alerts = await this.octokit.paginate(this.octokit.dependabot.listAlertsForRepo, {
				owner: this.project.owner,
				repo: this.project.repo,
				state: 'open',
				per_page: PAGE_SIZE,
			});
			return alerts.length;
		} catch {
			// 403 (Dependabot disabled) and any other failure are both "not measurable", not zero
			return null;
		}
	}

	private async fetchSecretScanningAlertCount(): Promise<number | null> {
		try {
			await this.checkRateLimit();
			const alerts = await this.octokit.paginate(this.octokit.secretScanning.listAlertsForRepo, {
				owner: this.project.owner,
				repo: this.project.repo,
				state: 'open',
				per_page: PAGE_SIZE,
			});
			return alerts.length;
		} catch {
			// 404 (secret scanning disabled / no GHAS) and any other failure are both "not measurable", not zero
			return null;
		}
	}

	private async calculateSecurityVulnerabilityCount(): Promise<number | null> {
		const [dependabotCount, secretScanningCount] = await Promise.all([
			this.fetchDependabotAlertCount(),
			this.fetchSecretScanningAlertCount(),
		]);

		if (dependabotCount === null && secretScanningCount === null) return null;

		return (dependabotCount ?? 0) + (secretScanningCount ?? 0);
	}

	private calculateStaleIssuesCount(issues: any[]): number {
		const staleThreshold = Date.now() - STALE_THRESHOLD_MS;
		return issues.filter(
			(issue: any) => issue.state === 'OPEN' && new Date(issue.updatedAt).getTime() < staleThreshold,
		).length;
	}
}
