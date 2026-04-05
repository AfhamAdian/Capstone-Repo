/**
 * Worker Process Entrypoint
 * Runs separately from the API to process sync jobs asynchronously
 */

import dotenv from 'dotenv';
import { QueueManager } from '@libs/queue/index.js';
import { processSyncJob } from './processors/sync-processor.js';
import { logger } from '@libs/logger.js';

dotenv.config();

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('REDIS_URL is required to start the worker');
  process.exit(1);
}

async function startWorker() {
  const queueManager = new QueueManager({ redisUrl });
  const log = logger.child({ component: 'sync-worker' });

  try {
    log.info('starting sync job worker');

    // Create and start the worker
    const worker = queueManager.createWorker(async (job) => {
      const jobLog = log.child({ jobId: job.data.jobId, projectId: job.data.projectId, sessionId: job.data.sessionId });
      jobLog.info({ tools: job.data.tools }, 'processing sync job');
      await processSyncJob(job.data);
      jobLog.info('completed sync job');
    });

    // Log worker events
    worker.on('completed', (job) => {
      log.info({ jobId: job?.id }, 'worker completed job');
    });

    worker.on('failed', (job, error) => {
      log.error({ jobId: job?.id, err: error }, 'worker job failed');
    });

    worker.on('error', (error) => {
      log.error({ err: error }, 'worker error');
    });

    log.info('sync job worker is running');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      log.info('received SIGTERM, shutting down gracefully');
      await worker.close();
      await queueManager.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      log.info('received SIGINT, shutting down gracefully');
      await worker.close();
      await queueManager.close();
      process.exit(0);
    });
  } catch (error) {
    log.error({ err: error }, 'failed to start worker');
    process.exit(1);
  }
}

startWorker();
