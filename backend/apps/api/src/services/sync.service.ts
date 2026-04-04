/**
 * Sync Service
 * Handles enqueuing sync jobs and managing sync lifecycle
 */

import type { QueueManager } from '@libs/queue/index.js';
import type { SyncRequestPayload, SyncJob } from '@libs/sync/index.js';

/**
 * TODO: Inject database repository for persisting sync jobs
 * Once you have the DB layer, this service should:
 * - Store sync job in database
 * - Load project integration secrets from database
 * - Query sync history
 */

interface SyncServiceDependencies {
  queueManager: QueueManager;
}

export class SyncService {
  constructor(private deps: SyncServiceDependencies) {}

  /**
   * Enqueue a sync job for asynchronous processing
   * @param payload - Sync request from frontend
   * @returns - Job ID and SSE stream information
   */
  async enqueueSyncJob(payload: SyncRequestPayload): Promise<{ jobId: string; streamKey: string }> {
    // TODO: Validate project exists in database
    // const project = await db.getProject(payload.projectId);
    // if (!project) throw new Error(`Project not found: ${payload.projectId}`);

    // TODO: Load project integrations from database
    // const integrations = await db.getProjectIntegrations(payload.projectId);

    // TODO: Validate requested tools have credentials
    // for (const tool of payload.tools) {
    //   if (!integrations[tool]) {
    //     throw new Error(`No integration found for ${tool}`);
    //   }
    // }

    // TODO: Replace this with DB lookup per user/project integration.
    // Example future flow:
    // 1) query integrations table using payload.projectId and authenticated user id
    // 2) read encrypted GitHub token from DB/secret store
    // 3) read repo owner/name from DB project integration settings
    // 4) pass all of them to queue via `integrations.github.{credentials,project}`
    const TEST_GITHUB_TOKEN = '';
    const TEST_GITHUB_OWNER = 'AfhamAdian';
    const TEST_GITHUB_REPO = 'Web-Session-Record-and-Playback';

    // Create sync job record in database
    const jobId = this.generateJobId();
    // TODO: Store in database
    // const job = await db.createSyncJob({
    //   id: jobId,
    //   projectId: payload.projectId,
    //   tools: payload.tools,
    //   sessionId: payload.sessionId,
    //   status: 'queued',
    //   createdAt: new Date(),
    // });

    // TODO: Enqueue job with BullMQ
    const mergedIntegrations = {
      ...(payload.integrations ?? {}),
    };

    if (payload.tools.includes('github')) {
      mergedIntegrations.github = {
        ...(mergedIntegrations.github ?? {}),
        credentials: {
          ...(mergedIntegrations.github?.credentials ?? {}),
          token: mergedIntegrations.github?.credentials?.token ?? TEST_GITHUB_TOKEN,
        },
        project: {
          ...(mergedIntegrations.github?.project ?? {}),
          owner: mergedIntegrations.github?.project?.owner ?? TEST_GITHUB_OWNER,
          repo: mergedIntegrations.github?.project?.repo ?? TEST_GITHUB_REPO,
        },
      };
    }

    await this.deps.queueManager.enqueue({
      jobId,
      projectId: payload.projectId,
      tools: payload.tools,
      sessionId: payload.sessionId,
      integrations: mergedIntegrations,
    });

    return {
      jobId,
      streamKey: payload.sessionId,
    };
  }

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
