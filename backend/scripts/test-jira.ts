/**
 * Standalone test for the Jira PM connector — no DB, no persistence.
 * Calls JiraConnector.getData() directly and prints the result.
 *
 * Run: npx tsx scripts/test-jira.ts
 *
 * Required env (set in backend/.env):
 *   JIRA_TOKEN     - a Jira API token
 *   JIRA_EMAIL     - the Atlassian account email the token belongs to
 *   JIRA_BOARD_URL - the board URL from your browser, e.g.
 *                    https://your-site.atlassian.net/jira/software/projects/PROJ/boards/1
 *                    (baseUrl, project key, and board ID are all parsed out of this)
 */

import 'dotenv/config';
import { createConnector } from '@libs/sync/index.js';

const token = process.env.JIRA_TOKEN;
const email = process.env.JIRA_EMAIL;
const boardUrl = process.env.JIRA_BOARD_URL;

// `c/` is optional: team-managed boards are .../software/projects/{KEY}/boards/{id},
// company-managed ("classic") boards are .../software/c/projects/{KEY}/boards/{id}.
const BOARD_URL_PATTERN = /^(https:\/\/[^/]+)\/jira\/software\/(?:c\/)?projects\/([^/]+)\/boards\/(\d+)/;

function parseBoardUrl(url: string): { baseUrl: string; projectKey: string; boardId: string } {
  const match = url.match(BOARD_URL_PATTERN);
  if (!match) {
    throw new Error(
      `JIRA_BOARD_URL doesn't look like a Jira board URL. Expected shape: ` +
        `https://your-site.atlassian.net/jira/software/projects/PROJ/boards/1`,
    );
  }
  return { baseUrl: match[1]!, projectKey: match[2]!, boardId: match[3]! };
}

async function main() {
  if (!token || !email || !boardUrl) {
    console.error('Missing input. Set JIRA_TOKEN, JIRA_EMAIL, JIRA_BOARD_URL in backend/.env');
    process.exit(1);
  }

  const { baseUrl, projectKey, boardId } = parseBoardUrl(boardUrl);

  console.log(`Fetching Jira metrics for ${projectKey}...\n`);

  const connector = createConnector({
    tool: 'jira',
    credentials: { token, email, baseUrl },
    project: { projectKey, boardId },
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
