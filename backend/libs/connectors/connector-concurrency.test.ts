import { describe, expect, it, vi } from 'vitest';
import { GithubActionsConnector } from './cicd/GithubActionsConnector/github-actions.connector.js';
import { GitHubConnector } from './vcs/GithubConnector/github.connector.js';

describe('connector concurrency safeguards', () => {
  it('fetches GitHub commit details once with at most four requests active', async () => {
    const connector = new GitHubConnector({
      provider: 'github',
      credentials: { token: 'test-token' },
      project: { owner: 'owner', repo: 'repo' },
    });
    const internal = connector as any;
    let active = 0;
    let maxActive = 0;

    internal.checkRateLimit = vi.fn(async () => undefined);
    internal.octokit = {
      repos: {
        getCommit: vi.fn(async ({ ref }: { ref: string }) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 10));
          active -= 1;
          return {
            data: {
              commit: { author: { name: ref } },
              files: [{ filename: 'src/index.ts' }],
            },
          };
        }),
      },
    };

    const commits = Array.from({ length: 7 }, (_, index) => ({ sha: `sha-${index}` }));
    const details = await internal.fetchCommitDetails(commits);

    expect(details).toHaveLength(7);
    expect(internal.octokit.repos.getCommit).toHaveBeenCalledTimes(7);
    expect(maxActive).toBe(4);

    internal.calculateCodeChurn(details);
    internal.calculateCodeOwnershipConcentration(details);
    expect(internal.octokit.repos.getCommit).toHaveBeenCalledTimes(7);
  });

  it('shares an in-flight JUnit artifact request between Actions metrics', async () => {
    const connector = new GithubActionsConnector({
      tool: 'github-actions',
      credentials: { token: 'test-token' },
      project: { owner: 'owner', repo: 'repo' },
    });
    const internal = connector as any;
    internal.fetchArtifactEntries = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return [{ entryName: 'junit.xml', content: '<testsuite><testcase name="works" /></testsuite>' }];
    });

    const [first, second] = await Promise.all([
      internal.fetchJUnitTestCasesForRun(42, /junit/i),
      internal.fetchJUnitTestCasesForRun(42, /junit/i),
    ]);

    expect(first).toEqual(second);
    expect(internal.fetchArtifactEntries).toHaveBeenCalledTimes(1);
  });
});
