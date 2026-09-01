/**
 * Standalone test for the SonarQube code quality connector — no DB, no persistence.
 * Calls SonarQubeConnector.getData() directly and prints the result.
 *
 * Run: npx tsx scripts/test-sonarqube-metrics.ts
 *
 * Required env (set in backend/.env):
 *   SONARQUBE_TOKEN             - a SonarQube/SonarCloud user token
 *   SONARQUBE_TEST_PROJECT_KEY  - project (component) key, e.g. "my-org_my-repo"
 *
 * Optional env:
 *   SONARQUBE_BASE_URL          - self-hosted SonarQube URL (defaults to https://sonarcloud.io)
 *   SONARQUBE_TEST_ORGANIZATION - SonarCloud organization key
 */

import 'dotenv/config';
import { SonarQubeConnector } from '@libs/connectors/quality/index.js';

const token = process.env.SONARQUBE_TOKEN;
const projectKey = process.env.SONARQUBE_TEST_PROJECT_KEY;
const baseUrl = process.env.SONARQUBE_BASE_URL;
const organization = process.env.SONARQUBE_TEST_ORGANIZATION;

async function main() {
  if (!token || !projectKey) {
    console.error(
      'Missing input. Set SONARQUBE_TOKEN, SONARQUBE_TEST_PROJECT_KEY in backend/.env',
    );
    process.exit(1);
  }

  console.log(`Fetching SonarQube metrics for ${projectKey}...\n`);

  const connector = new SonarQubeConnector({
    provider: 'sonarqube',
    credentials: { token, baseUrl },
    project: { projectKey, organization },
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
