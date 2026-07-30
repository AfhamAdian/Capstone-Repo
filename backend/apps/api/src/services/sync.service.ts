/**
 * Sync Service
 * Handles enqueuing sync jobs and managing sync lifecycle
 */

import type { QueueManager } from '@libs/queue/index.js';
import type { SyncRequestPayload, SyncJob } from '@libs/sync/index.js';
import { getProjectIntegrationsForTools } from '../database/project.js';
import { logger } from '@libs/logger.js';

/**
 * TODO: Inject database repository for persisting sync jobs
 * Once you have the DB layer, this service should:
 * - Load project integration secrets from database
 */

interface SyncServiceDependencies {
  queueManager: QueueManager;
}

export class SyncService {
  private readonly log = logger.child({ component: 'sync-service' });

  constructor(private deps: SyncServiceDependencies) {}

  /**
   * Enqueue a sync job for asynchronous processing
   * @param payload - Sync request from frontend
   * @returns - Job ID and SSE stream information
   */
  async enqueueSyncJob(payload: SyncRequestPayload): Promise<{ jobId: string; streamKey: string }> {
    const jobId = this.generateJobId();
    const startedAt = Date.now();

    this.log.info({ jobId, projectId: payload.projectId, sessionId: payload.sessionId, tools: payload.tools }, 'sync enqueue requested');

    const integrationLookupStartedAt = Date.now();
    const integrations = await getProjectIntegrationsForTools(payload.projectId, payload.tools);
    this.log.info(
      {
        jobId,
        projectId: payload.projectId,
        elapsedMs: Date.now() - integrationLookupStartedAt,
        tools: payload.tools,
      },
      'loaded project integrations from database',
    );

    await this.deps.queueManager.enqueue({
      jobId,
      projectId: payload.projectId,
      tools: payload.tools,
      sessionId: payload.sessionId,
      integrations,
    });

    this.log.info(
      {
        jobId,
        projectId: payload.projectId,
        sessionId: payload.sessionId,
        elapsedMs: Date.now() - startedAt,
        tools: payload.tools,
      },
      'sync job enqueued',
    );

    return {
      jobId,
      streamKey: payload.sessionId,
    };
  }


  // HELPER METHODS
  /**
   * Get sync job status
   */
  async getSyncJobStatus(jobId: string): Promise<SyncJob | null> {
    const job = await this.deps.queueManager.getJobStatus(jobId);
    return job as SyncJob | null;
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
