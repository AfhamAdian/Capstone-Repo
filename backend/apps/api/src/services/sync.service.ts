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
    // 2) read encrypted provider tokens from DB/secret store
    // 3) read provider project settings from DB (repo, owner, jira project key, board id, etc.)
    // 4) pass all of them to queue via `integrations.<tool>.{credentials,project}`
    const TEST_GITHUB_TOKEN = '';
    const TEST_GITHUB_OWNER = 'AfhamAdian';
    const TEST_GITHUB_REPO = 'NiramoyAI';

    const TEST_JIRA_TOKEN='-4iH4NW-tDU4vmZwad1GyXMmaIfgrOUb0xk2Nw7mRI-grWqAU=0EB0E3E8'
    const TEST_JIRA_EMAIL='tahmidulislamomi01@gmail.com'
    const TEST_JIRA_BASE_URL='https://capstoneprojectbyomi2.atlassian.net'
    const TEST_JIRA_PROJECT_KEY='SCRUM'
    const TEST_JIRA_BOARD_ID=1


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

    if (payload.tools.includes('jira')) {
      mergedIntegrations.jira = {
        ...(mergedIntegrations.jira ?? {}),
        credentials: {
          ...(mergedIntegrations.jira?.credentials ?? {}),
          token: mergedIntegrations.jira?.credentials?.token ?? TEST_JIRA_TOKEN,
          email: mergedIntegrations.jira?.credentials?.email ?? TEST_JIRA_EMAIL,
          baseUrl: mergedIntegrations.jira?.credentials?.baseUrl ?? TEST_JIRA_BASE_URL,
        },
        project: {
          ...(mergedIntegrations.jira?.project ?? {}),
          projectKey: mergedIntegrations.jira?.project?.projectKey ?? TEST_JIRA_PROJECT_KEY,
          boardId: mergedIntegrations.jira?.project?.boardId ?? String(TEST_JIRA_BOARD_ID),
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
