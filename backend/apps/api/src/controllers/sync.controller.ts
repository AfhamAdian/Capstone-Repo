/**
 * Sync Controller
 * Handles HTTP endpoints for sync operations
 */

import type { Request, Response } from 'express';
import { QueueManager } from '@libs/queue/index.js';
import type { SyncRequestPayload } from '@libs/sync/index.js';
import { SyncService } from '../services/sync.service.js';
import { env } from '../config/env.js';

if (!env.redisUrl) {
  throw new Error('REDIS_URL is required to enqueue sync jobs');
}

const queueManager = new QueueManager({ redisUrl: env.redisUrl });

const syncService = new SyncService({
  queueManager,
});

/**
 * POST /api/v1/sync
 * Enqueue a sync job
 */
export async function enqueueSyncJob(request: Request, response: Response): Promise<void> {
  try {
    const payload = request.body as SyncRequestPayload;

    // TODO: Validate request payload
    if (!payload.projectId) {
      response.status(400).json({ message: 'projectId is required' });
      return;
    }

    if (!Array.isArray(payload.tools) || payload.tools.length === 0) {
      response.status(400).json({ message: 'tools must be a non-empty array' });
      return;
    }

    if (!payload.sessionId) {
      response.status(400).json({ message: 'sessionId is required for SSE updates' });
      return;
    }

    const result = await syncService.enqueueSyncJob(payload);

    response.status(202).json({
      message: 'Sync job queued',
      jobId: result.jobId,
      streamKey: result.streamKey,
      tools: payload.tools,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to enqueue sync job';
    response.status(500).json({ message });
  }
}

/**
 * GET /api/v1/sync/:jobId
 * Get sync job status
 */
export async function getSyncStatus(request: Request, response: Response): Promise<void> {
  try {
    const { jobId } = request.params;

    if (!jobId) {
      response.status(400).json({ message: 'jobId is required' });
      return;
    }

    const job = await syncService.getSyncJobStatus(jobId);

    if (!job) {
      response.status(404).json({ message: 'Sync job not found' });
      return;
    }

    response.status(200).json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get sync status';
    response.status(500).json({ message });
  }
}
