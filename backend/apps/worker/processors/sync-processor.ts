/**
 * Sync Job Processor
 * Handles the actual sync logic - fetching data, storing, calculating risk, etc.
 */

import type { SyncJobData } from '@libs/queue/index.js';
import type { ConnectorOutput, SupportedTool } from '@libs/sync/index.js';
import { createConnector } from '@libs/sync/index.js';
import { eventStore } from '@libs/queue/index.js';
import { persistConnectorMetrics } from '../../api/database/metrics.js';
import { calculateAndSaveRiskScores } from '../../api/services/risk-calculation.service.js';
import { blendAndSaveProjectHealthScore } from '../../api/services/health-score-blend.service.js';
import { evaluateSurveyTrigger } from '../../api/services/survey-trigger.service.js';
import { logger } from '@libs/logger.js';
import { mapWithConcurrency } from '../utils/map-with-concurrency.js';

const TOOL_FETCH_CONCURRENCY = 4;

type ToolFetchResult =
  | { tool: SupportedTool; output: ConnectorOutput; startedAt: number }
  | { tool: SupportedTool; error: unknown; startedAt: number };

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

    // External APIs are independent, so fetch from up to four tools at once.
    // Persistence remains sequential below because every tool must write to the
    // same metrics snapshot.
    const fetchResults = await mapWithConcurrency(
      tools,
      TOOL_FETCH_CONCURRENCY,
      async (tool): Promise<ToolFetchResult> => {
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

          let integration = integrations?.[tool];

          // Reuse github credentials for github-actions if they exist
          if (!integration && tool === 'github-actions' && integrations?.['github']) {
            integration = integrations['github'];
          }

          //FIXME: Better Design for many tools
          if (!integration) {
            throw new Error(`Missing integration payload for tool: ${tool}`);
          }

          if (tool === 'github' || tool === 'github-actions') {
            if (!integration.credentials?.token) {
              throw new Error(`Missing ${tool}.credentials.token`);
            }
            if (!integration.project?.owner || !integration.project?.repo) {
              throw new Error(`Missing ${tool}.project.owner or ${tool}.project.repo`);
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

          if (tool === 'sonarqube') {
            if (!integration.credentials?.token) {
              throw new Error('Missing sonarqube.credentials.token');
            }
            if (!integration.project?.projectKey && !integration.project?.key) {
              throw new Error('Missing sonarqube.project.projectKey (or sonarqube.project.key)');
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

          return { tool, output: connectorOutput, startedAt: toolStartedAt };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toolLog.error({ err: error, elapsedMs: Date.now() - toolStartedAt }, 'failed to fetch tool data');

          await eventStore.emitProgress({
            jobId,
            sessionId,
            tool,
            status: 'failed',
            timestamp: new Date(),
            error: message,
          });

          return { tool, error, startedAt: toolStartedAt };
        }
      },
    );

    for (const result of fetchResults) {
      const { tool } = result;
      const toolLog = log.child({ tool });

      if ('error' in result) {
        failedTools.push(tool);
        continue;
      }

      try {
        const persistStartedAt = Date.now();
        const persistedSnapshotId = await persistConnectorMetrics({
          projectId: numericProjectId,
          tool,
          data: result.output.data,
          snapshotId: snapshotId ?? undefined,
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
        toolLog.info({ elapsedMs: Date.now() - result.startedAt }, 'tool sync completed');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        toolLog.error({ err: error, elapsedMs: Date.now() - result.startedAt }, 'failed to persist tool data');

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

        // Refresh the blended (60% metrics + 40% survey) health score alongside the pure-metrics riskscore.
        // blendAndSaveProjectHealthScore already swallows its own errors - non-fatal by design (survey feature is supplementary).
        await blendAndSaveProjectHealthScore(numericProjectId);
        await evaluateSurveyTrigger(numericProjectId, riskScores);
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
