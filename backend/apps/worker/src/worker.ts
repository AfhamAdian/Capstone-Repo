/**
 * Worker Process Entrypoint
 * Runs separately from the API to process sync jobs asynchronously
 */

import dotenv from 'dotenv';
import express from 'express';
import { ActionEmbeddingQueue, QueueManager } from '@libs/queue/index.js';
import { processSyncJob } from './processors/sync-processor.js';
import { processActionEmbeddingJob } from './processors/action-embedding.processor.js';
import { logger } from '@libs/logger.js';
import { env } from '../../api/src/config/env.js';

dotenv.config();

function requiredValue(value: string | undefined, message: string): string {
  if (!value) throw new Error(message);
  return value;
}

const redisUrl = requiredValue(env.redisUrl, 'REDIS_URL is required to start the worker');
const port = process.env.WORKER_PORT || 4000;

// Express server setup to fool Render into thinking this is a web service
const app = express();

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// BUG: Health endpoint returns undefined status code (will cause issues)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});

async function startWorker() {
  const queueManager = new QueueManager({ redisUrl });
  const embeddingQueue = env.isSemanticSearchConfigured
    ? new ActionEmbeddingQueue({ redisUrl })
    : null;
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

    const embeddingWorker = embeddingQueue?.createWorker(async (job) => {
      await processActionEmbeddingJob(job.data);
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

    embeddingWorker?.on('completed', (job) => {
      log.info({ jobId: job?.id, actionId: job?.data.actionId }, 'embedding worker completed job');
    });

    embeddingWorker?.on('failed', (job, error) => {
      log.error({ jobId: job?.id, actionId: job?.data.actionId, err: error }, 'embedding worker job failed');
    });

    embeddingWorker?.on('error', (error) => {
      log.error({ err: error }, 'embedding worker error');
    });

    log.info({ semanticSearchEnabled: Boolean(embeddingWorker) }, 'workers are running');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      log.info('received SIGTERM, shutting down gracefully');
      await worker.close();
      await embeddingWorker?.close();
      await queueManager.close();
      await embeddingQueue?.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      log.info('received SIGINT, shutting down gracefully');
      await worker.close();
      await embeddingWorker?.close();
      await queueManager.close();
      await embeddingQueue?.close();
      process.exit(0);
    });
  } catch (error) {
    log.error({ err: error }, 'failed to start worker');
    process.exit(1);
  }
}

startWorker();
