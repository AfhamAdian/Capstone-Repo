/**
 * Standalone test for the GitHub Actions CI/CD connector — no DB, no persistence.
 * Calls GithubActionsConnector.getData() directly and prints the result.
 *
 * Run: npx tsx scripts/test-github-actions-metrics.ts
 *
 * Required env (set in backend/.env):
 *   GITHUB_TOKEN      - a GitHub personal access token
 *   GITHUB_TEST_OWNER - repo owner/org, e.g. "octocat"
 *   GITHUB_TEST_REPO  - repo name, e.g. "hello-world" (should use GitHub Actions)
 */

import 'dotenv/config';
import { GithubActionsConnector } from '@libs/connectors/cicd/GithubActionsConnector/github-actions.connector.js';

const token = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_TEST_OWNER;
const repo = process.env.GITHUB_TEST_REPO;

async function main() {
  if (!token || !owner || !repo) {
    console.error(
      'Missing input. Set GITHUB_TOKEN, GITHUB_TEST_OWNER, GITHUB_TEST_REPO in backend/.env',
    );
    process.exit(1);
  }

  console.log(`Fetching GitHub Actions CI/CD metrics for ${owner}/${repo}...\n`);

  const connector = new GithubActionsConnector({
    tool: 'github-actions',
    credentials: { token },
    project: { owner, repo },
  });

  const start = Date.now();
  const output = await connector.getData();
  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`Done in ${elapsedSec}s\n`);
  console.dir(output.data, { depth: null });
}

main().catch((error) => {
  console.error('\nFAILED:', error?.message ?? error);
  process.exit(1);
});
