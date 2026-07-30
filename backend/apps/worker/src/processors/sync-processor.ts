/**
 * Sync Job Processor
 * Handles the actual sync logic - fetching data, storing, calculating risk, etc.
 */

// TODO: PROCESSES SEQUENTIALLY, HAVE TO MAKE IT ASYNC.

import type { SyncJobData } from '@libs/queue/index.js';
import type { SupportedTool } from '@libs/sync/index.js';
import { createConnector } from '@libs/sync/index.js';
import { eventStore } from '@libs/queue/index.js';
import { persistConnectorMetrics } from '../../../api/src/database/metrics.js';
import { calculateAndSaveRiskScores } from '../../../api/src/services/risk-calculation.service.js';
import { logger } from '@libs/logger.js';

/**
 * Process a single sync job
 * This function runs in the worker process
 */
export async function processSyncJob(jobData: SyncJobData): Promise<void> {
  const { jobId, projectId, tools, sessionId, integrations } = jobData;
  const log = logger.child({ component: 'sync-processor', jobId, projectId, sessionId });

  const numericProjectId = Number(projectId);
  if (!Number.isFinite(numericProjectId) || numericProjectId <= 0) {
    throw new Error(`Invalid projectId for metric persistence: ${projectId}`);
  }

  const completedTools: SupportedTool[] = [];
  const failedTools: SupportedTool[] = [];
  let snapshotId: number | null = null;
  let finalRiskScore: number | undefined;
  let finalRiskScores: Record<string, number | null> | undefined;

  try {
    log.info({ tools }, 'started processing sync job');

    // Process each tool sequentially
    for (const tool of tools) {
      const toolLog = log.child({ tool });
      const toolStartedAt = Date.now();

      try {
        // Emit progress event: tool sync started
        await eventStore.emitProgress({
          jobId,
          sessionId,
          tool,
          status: 'syncing',
          timestamp: new Date(),
        });

        toolLog.info('tool sync started');

        const integration = integrations?.[tool];

        //FIXME: Better Design for many tools
        if (!integration) {
          throw new Error(`Missing integration payload for tool: ${tool}`);
        }

        if (tool === 'github') {
          if (!integration.credentials?.token) {
            throw new Error('Missing github.credentials.token');
          }
          if (!integration.project?.owner || !integration.project?.repo) {
            throw new Error('Missing github.project.owner or github.project.repo');
          }
        }

        if (tool === 'jira') {
          toolLog.info(`integration details: ${JSON.stringify(integration.credentials)}`);
          if (!integration.credentials?.token) {
            throw new Error('Missing jira.credentials.token');
          }
          if (!integration.credentials?.email) {
            throw new Error('Missing jira.credentials.email');
          }
          if (!integration.credentials?.baseUrl) {
            throw new Error('Missing jira.credentials.baseUrl');
          }
          if (!integration.project?.projectKey && !integration.project?.key) {
            throw new Error('Missing jira.project.projectKey (or jira.project.key)');
          }
        }

        const connector = createConnector({
          tool,
          credentials: {
            ...(integration?.credentials ?? {}),
          },
          project: {
            ...(integration?.project ?? {}),
          },
        });

        toolLog.info('fetching connector data');

        const connectorOutput = await connector.getData();

        //FIXME : delete loggin in production
        if (tool === 'github') {
          toolLog.info(
            {
              githubData: connectorOutput.data,
            },
            'github data ingested from connector',
          );
        }
        toolLog.info(
          {
            elapsedMs: Date.now() - toolStartedAt,
          },
          'connector data fetched',
        );

        const persistStartedAt = Date.now();
        const persistedSnapshotId = await persistConnectorMetrics({
          projectId: numericProjectId,
          tool,
          data: connectorOutput.data,
        });

        // Store snapshot ID for risk calculation
        if (!snapshotId) {
          snapshotId = persistedSnapshotId;
        }

        toolLog.info({ elapsedMs: Date.now() - persistStartedAt }, 'persisted connector metrics');

        // Emit progress event: tool sync completed
        await eventStore.emitProgress({
          jobId,
          sessionId,
          tool,
          status: 'completed',
          timestamp: new Date(),
        });

        completedTools.push(tool);
        toolLog.info({ elapsedMs: Date.now() - toolStartedAt }, 'tool sync completed');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        toolLog.error({ err: error, elapsedMs: Date.now() - toolStartedAt }, 'failed to sync tool');

        // Emit progress event: tool sync failed
        await eventStore.emitProgress({
          jobId,
          sessionId,
          tool,
          status: 'failed',
          timestamp: new Date(),
          error: message,
        });

        failedTools.push(tool);
      }
    }

    // Determine overall status
    const status = failedTools.length === 0 ? 'success' : failedTools.length === completedTools.length ? 'failed' : 'partial';

    // Calculate risk scores if at least one tool completed successfully
    if (completedTools.length > 0 && snapshotId) {
      try {
        const riskStartedAt = Date.now();
        log.info({ snapshotId }, 'starting risk score calculation');

        await eventStore.emitProgress({
          jobId,
          sessionId,
          tool: 'risk',
          status: 'calculating-risk',
          timestamp: new Date(),
        });

        const riskScores = await calculateAndSaveRiskScores(snapshotId);
        finalRiskScores = riskScores;
        const numericScores = Object.values(riskScores).filter((score): score is number => typeof score === 'number');
        if (numericScores.length > 0) {
          finalRiskScore = Math.round(numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length);
        }

        log.info({ snapshotId, riskScores }, 'risk scores calculated successfully');

        log.info({ snapshotId, elapsedMs: Date.now() - riskStartedAt }, 'risk scores calculated successfully');
      } catch (riskError) {
        const message = riskError instanceof Error ? riskError.message : 'Unknown error';
        log.error({ err: riskError, snapshotId }, 'failed to calculate risk scores');
        // Don't fail the sync job if risk calculation fails - risk is supplementary
      }
    }

    // TODO: Update job status to completed in database
    // await db.updateSyncJob(jobId, {
    //   status: 'completed',
    //   completedAt: new Date(),
    // });

    // Emit completion event
    await eventStore.emitCompletion({
      jobId,
      sessionId,
      status,
      timestamp: new Date(),
      toolsCompleted: completedTools,
      toolsFailed: failedTools,
      riskScore: finalRiskScore,
      riskScores: finalRiskScores,
    });

    log.info(
      {
        status,
        completedTools,
        failedTools,
      },
      'sync job completed',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error({ err: error, completedTools, failedTools }, 'sync job failed');

    // TODO: Update job status to failed in database
    // await db.updateSyncJob(jobId, {
    //   status: 'failed',
    //   completedAt: new Date(),
    //   error: message,
    // });

    // Emit error event
    await eventStore.emitCompletion({
      jobId,
      sessionId,
      status: 'failed',
      timestamp: new Date(),
      toolsCompleted: completedTools,
      toolsFailed: tools,
      error: message,
    });

    throw error; // Re-throw so BullMQ knows the job failed
  }
}

