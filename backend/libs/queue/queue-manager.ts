/**
 * BullMQ Queue Manager
 * Manages async job queueing and processing
 */

import { Queue, Worker } from 'bullmq';
import type { SyncJob } from '@libs/sync/index.js';

/**
 * Sync job data structure sent to the queue
 */
export interface SyncJobData {
  jobId: string;
  projectId: string;
  tools: string[];
  sessionId: string;
  integrations: Record<string, any>;
}

/**
 * Redis connection configuration
 */
export interface QueueConfig {
  redisUrl: string;
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
  async enqueue(jobData: SyncJobData): Promise<string> {
    try {
      const job = await this.queue.add('sync-request', jobData, {
        jobId: jobData.jobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
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
  createWorker(processor: (jobData: SyncJobData) => Promise<void>): Worker<SyncJobData> {
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
        progress: job.progress(),
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
