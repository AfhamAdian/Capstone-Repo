/**
 * Sync Job Processor
 * Handles the actual sync logic - fetching data, storing, calculating risk, etc.
 */

// TODO: PROCESSES SEQUENTIALLY, HAVE TO MAKE IT ASYNC.

import type { SyncJobData } from '@libs/queue/index.js';
import type { SupportedTool } from '@libs/sync/index.js';
import { createConnector } from '@libs/sync/index.js';
import { eventStore } from '@libs/queue/index.js';

/**
 * Process a single sync job
 * This function runs in the worker process
 */
export async function processSyncJob(jobData: SyncJobData): Promise<void> {
  const { jobId, projectId, tools, sessionId, integrations } = jobData;

  const completedTools: SupportedTool[] = [];
  const failedTools: SupportedTool[] = [];

  try {
    // TODO: Update job status to in-progress in database
    // await db.updateSyncJob(jobId, { status: 'in-progress', startedAt: new Date() });

    // Process each tool sequentially
    for (const tool of tools) {
      try {
        // Emit progress event: tool sync started
        eventStore.emitProgress({
          jobId,
          tool,
          status: 'syncing',
          timestamp: new Date(),
        });

        // Get integration credentials for this tool
        const integration = integrations[tool];
        if (!integration) {
          throw new Error(`No integration found for ${tool}`);
        }

        // Create and execute connector
        const connector = createConnector({
          tool,
          credentials: integration.credentials,
          project: integration.project,
        });

        const connectorOutput = await connector.getData();

        // TODO: Store connector output in database
        // await db.storeConnectorOutput(jobId, tool, connectorOutput);

        // TODO: Calculate and persist risk score
        // const riskScore = await calculateRisk({
        //   tool,
        //   data: connectorOutput,
        //   projectId,
        // });
        // await db.storeRiskScore(jobId, tool, riskScore);

        // Emit progress event: tool sync completed
        eventStore.emitProgress({
          jobId,
          tool,
          status: 'completed',
          timestamp: new Date(),
        });

        completedTools.push(tool);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to sync ${tool}:`, message);

        // Emit progress event: tool sync failed
        eventStore.emitProgress({
          jobId,
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

    // TODO: Update job status to completed in database
    // await db.updateSyncJob(jobId, {
    //   status: 'completed',
    //   completedAt: new Date(),
    // });

    // Emit completion event
    eventStore.emitCompletion({
      jobId,
      status,
      timestamp: new Date(),
      toolsCompleted: completedTools,
      toolsFailed: failedTools,
      // TODO: Fetch final risk score from database once all tools are synced
      // riskScore: await db.getProjectRiskScore(projectId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Sync job ${jobId} failed:`, message);

    // TODO: Update job status to failed in database
    // await db.updateSyncJob(jobId, {
    //   status: 'failed',
    //   completedAt: new Date(),
    //   error: message,
    // });

    // Emit error event
    eventStore.emitCompletion({
      jobId,
      status: 'failed',
      timestamp: new Date(),
      toolsCompleted: completedTools,
      toolsFailed: tools,
      error: message,
    });

    throw error; // Re-throw so BullMQ knows the job failed
  }
}

