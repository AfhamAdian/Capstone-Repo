/**
 * BullMQ Queue Manager
 * Manages async job queueing and processing
 */

import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type { SupportedTool } from '@libs/sync/index.js';

interface ToolIntegration {
  credentials?: Record<string, string | undefined>;
  project?: Record<string, string | undefined>;
}

/**
 * Sync job data structure sent to the queue
 */
export interface SyncJobData {
  jobId: string;
  projectId: string;
  tools: SupportedTool[];
  sessionId: string;
  integrations: Record<string, ToolIntegration>;
}

/**
 * Redis connection configuration
 */
export interface QueueConfig {
  redisUrl: string;
}

/**
 * Per-job overrides. Used by the periodic sync, which must not crowd out the
 * interactive syncs a user is watching in the UI.
 */
export interface EnqueueOptions {
  /**
   * BullMQ treats unset/0 as the HIGHEST priority, so interactive syncs are left
   * alone and scheduled work is given a positive (lower) priority.
   */
  priority?: number;
  /** Delay before the job becomes runnable — used to space out same-token projects. */
  delayMs?: number;
  /**
   * Overrides `removeOnComplete: true`. Scheduled jobs retain their completed record
   * so their deterministic jobId stays reserved and a retried tick can't double-sync.
   */
  removeOnCompleteAgeSeconds?: number;
}

/**
 * Queue manager for coordinating sync jobs
 */
export class QueueManager {
  private queue: Queue<SyncJobData>;
  private config: QueueConfig;

  constructor(config: QueueConfig) {
    this.config = config;
    this.queue = new Queue<SyncJobData>('sync', {
      connection: {
        url: config.redisUrl,
      },
    });
  }

  /**
   * Enqueue a sync job for processing
   */
  async enqueue(jobData: SyncJobData, options: EnqueueOptions = {}): Promise<string> {
    try {
      const job = await this.queue.add('sync-request', jobData, {
        jobId: jobData.jobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: options.removeOnCompleteAgeSeconds
          ? { age: options.removeOnCompleteAgeSeconds }
          : true,
        removeOnFail: false,
        ...(options.priority !== undefined ? { priority: options.priority } : {}),
        ...(options.delayMs ? { delay: options.delayMs } : {}),
      });

      return job.id || jobData.jobId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enqueue job';
      throw new Error(`Queue enqueue failed: ${message}`);
    }
  }

  /**
   * Create a worker to process sync jobs
   * Worker will be instantiated in the separate worker process
   */
  createWorker(processor: (job: Job<SyncJobData>) => Promise<void>): Worker<SyncJobData> {
    return new Worker<SyncJobData>('sync', processor, {
      connection: {
        url: this.config.redisUrl,
      },
      concurrency: 2, // Process 2 sync jobs in parallel
    });
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<any> {
    try {
      const job = await this.queue.getJob(jobId);
      return job ? {
        id: job.id,
        progress: job.progress,
        state: await job.getState(),
        attemptsMade: job.attemptsMade,
        data: job.data,
      } : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get job status';
      throw new Error(`Queue status check failed: ${message}`);
    }
  }

  /**
   * Clean up queue resources
   */
  async close(): Promise<void> {
    await this.queue.close();
  }
}
