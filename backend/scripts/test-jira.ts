/**
 * End-to-end Jira pipeline test (no queue): creds -> fetch -> persist -> score.
 * Run: npx tsx scripts/test-jira.ts
 */

import 'dotenv/config';
import { getProjectIntegrationsForTools } from '../apps/api/src/database/project.js';
import { createConnector } from '@libs/sync/index.js';
import { persistConnectorMetrics } from '../apps/api/src/database/metrics.js';
import { calculateAndSaveRiskScores } from '../apps/api/src/services/risk-calculation.service.js';

const PROJECT_ID = '4';
const TOOL = 'jira' as const;

async function main() {
  console.log('1) Loading Jira creds from DB/env (project %s)...', PROJECT_ID);
  const integrations = await getProjectIntegrationsForTools(PROJECT_ID, [TOOL]);
  const integration = integrations[TOOL];
  console.log('   loaded:', {
    hasToken: Boolean(integration?.credentials?.token),
    email: integration?.credentials?.email,
    baseUrl: integration?.credentials?.baseUrl,
    projectKey: integration?.project?.projectKey,
    boardId: integration?.project?.boardId,
  });

  console.log('2) Fetching from Jira...');
  const connector = createConnector({
    tool: TOOL,
    credentials: { ...(integration?.credentials ?? {}) },
    project: { ...(integration?.project ?? {}) },
  });
  const output = await connector.getData();
  console.log('   metrics:');
  console.dir((output.data as { metrics: unknown }).metrics, { depth: null });

  console.log('3) Persisting...');
  const snapshotId = await persistConnectorMetrics({
    projectId: Number(PROJECT_ID),
    tool: TOOL,
    data: output.data,
  });
  console.log('   snapshotId:', snapshotId);

  console.log('4) Risk scores...');
  const scores = await calculateAndSaveRiskScores(snapshotId);
  console.log('   scores:', scores);

  console.log('\nDONE. snapshotId=%s', snapshotId);
  process.exit(0);
}

main().catch((error) => {
  console.error('\nFAILED:', error?.message ?? error);
  process.exit(1);
});
