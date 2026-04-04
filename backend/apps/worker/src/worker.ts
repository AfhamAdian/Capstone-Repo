/**
 * Worker Process Entrypoint
 * Runs separately from the API to process sync jobs asynchronously
 */

import dotenv from 'dotenv';
import { QueueManager } from '@libs/queue/index.js';
import { processSyncJob } from './processors/sync-processor.js';

dotenv.config();

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('REDIS_URL is required to start the worker');
  process.exit(1);
}

async function startWorker() {
  const queueManager = new QueueManager({ redisUrl });

  try {
    console.log('Starting sync job worker...');

    // Create and start the worker
    const worker = queueManager.createWorker(async (job) => {
      console.log(`Processing sync job: ${job.data.jobId}`);
      await processSyncJob(job.data);
      console.log(`Completed sync job: ${job.data.jobId}`);
    });

    // Log worker events
    worker.on('completed', (job) => {
      console.log(`✓ Job ${job.id} completed`);
    });

    worker.on('failed', (job, error) => {
      console.error(`✗ Job ${job?.id} failed:`, error.message);
    });

    worker.on('error', (error) => {
      console.error('Worker error:', error);
    });

    console.log('Sync job worker is running');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, shutting down gracefully...');
      await worker.close();
      await queueManager.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('Received SIGINT, shutting down gracefully...');
      await worker.close();
      await queueManager.close();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

startWorker();
