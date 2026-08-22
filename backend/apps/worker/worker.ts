/**
 * Worker Process Entrypoint
 * Runs separately from the API to process sync jobs asynchronously
 */

import dotenv from 'dotenv';
import express from 'express';
import { ActionEmbeddingQueue, QueueManager, SurveyQueueManager } from '@libs/queue/index.js';
import { processSyncJob } from './processors/sync-processor.js';
import { processActionEmbeddingJob } from './processors/action-embedding.processor.js';
import { processSurveySendJob } from './processors/survey-send-processor.js';
import { processSurveyInsightJob } from './processors/survey-insight-processor.js';
import { processSurveyDistributionJob } from './processors/survey-distribution-processor.js';
import { logger } from '@libs/logger.js';
import { updateSurveyStatus } from '../api/database/survey.js';
import { env } from '../api/config/env.js';

dotenv.config();

const redisUrl = process.env.REDIS_URL;
// Never reuse the API's PORT locally — both processes load the same .env.
// Render web services inject PORT; local / dedicated workers use WORKER_PORT (default 4000).
const port = Number(
  process.env.WORKER_PORT
    ?? (process.env.RENDER ? process.env.PORT : undefined)
    ?? 4000,
);

if (!redisUrl) {
  console.error('REDIS_URL is required to start the worker');
  process.exit(1);
}

// Optional health server (Render web-service probes). Queue workers still run if this bind fails.
const app = express();

app.get('/', (_req, res) => {
  res.send('Hello World!');
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

const healthServer = app.listen(port, () => {
  logger.info({ component: 'worker-health', port }, 'worker health server listening');
});
healthServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.warn(
      { component: 'worker-health', port },
      'worker health port is already in use; queue workers will still run',
    );
    return;
  }
  throw error;
});

async function startWorker() {
  const queueManager = new QueueManager({ redisUrl: redisUrl! });
  const surveyQueueManager = new SurveyQueueManager({ redisUrl: redisUrl! });
  const embeddingQueue = env.isSemanticSearchConfigured
    ? new ActionEmbeddingQueue({ redisUrl: redisUrl! })
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

    log.info('sync job worker is running');
    log.info({ enabled: Boolean(embeddingWorker) }, 'action embedding worker configured');

    const surveyLog = logger.child({ component: 'survey-send-worker' });
    const surveySendWorker = surveyQueueManager.createSurveySendWorker(async (job) => {
      surveyLog.info({ surveyId: job.data.surveyId }, 'processing survey-send job');
      await processSurveySendJob(job.data);
      surveyLog.info({ surveyId: job.data.surveyId }, 'completed survey-send job');
    });
    surveySendWorker.on('failed', (job, error) => {
      surveyLog.error({ surveyId: job?.data.surveyId, err: error }, 'survey-send job failed');
      if (job?.data.surveyId) {
        void updateSurveyStatus(job.data.surveyId, 'failed', { analysisError: error.message }).catch((statusError) => {
          surveyLog.error({ surveyId: job.data.surveyId, err: statusError }, 'failed to persist survey delivery error');
        });
      }
    });
    surveyLog.info('survey-send worker is running');

    const insightLog = logger.child({ component: 'survey-insight-worker' });
    const surveyInsightWorker = surveyQueueManager.createSurveyInsightWorker(async (job) => {
      insightLog.info({ surveyId: job.data.surveyId }, 'processing survey-insight job');
      try {
        await processSurveyInsightJob(job.data);
      } catch (error) {
        await updateSurveyStatus(job.data.surveyId, 'failed', {
          analysisError: error instanceof Error ? error.message : 'Survey analysis failed',
        });
        throw error;
      }
      insightLog.info({ surveyId: job.data.surveyId }, 'completed survey-insight job');
    });
    surveyInsightWorker.on('failed', (job, error) => {
      insightLog.error({ surveyId: job?.data.surveyId, err: error }, 'survey-insight job failed');
    });
    insightLog.info('survey-insight worker is running');

    const distributionLog = logger.child({ component: 'survey-distribution-worker' });
    const surveyDistributionWorker = surveyQueueManager.createSurveyDistributionWorker(async () => {
      distributionLog.info('processing survey-distribution job');
      const closedSurveyIds = await processSurveyDistributionJob();
      await Promise.all(closedSurveyIds.map((surveyId) => surveyQueueManager.enqueueSurveyInsight(surveyId)));
      distributionLog.info('completed survey-distribution job');
    });
    surveyDistributionWorker.on('failed', (job, error) => {
      distributionLog.error({ jobId: job?.id, err: error }, 'survey-distribution job failed');
    });
    // Hourly tick: assigns each project's randomized monthly send moment,
    // generates
    // questions SURVEY_QUESTION_GEN_LEAD_DAYS before that moment, and auto-sends
    // after its review window unless paused. Idempotent - safe on every boot.
    await surveyQueueManager.scheduleSurveyDistribution('0 * * * *');
    distributionLog.info('survey-distribution worker is running (hourly tick, staggered per-project send)');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      log.info('received SIGTERM, shutting down gracefully');
      await worker.close();
      await embeddingWorker?.close();
      await surveySendWorker.close();
      await surveyInsightWorker.close();
      await surveyDistributionWorker.close();
      await queueManager.close();
      await embeddingQueue?.close();
      await surveyQueueManager.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      log.info('received SIGINT, shutting down gracefully');
      await worker.close();
      await embeddingWorker?.close();
      await surveySendWorker.close();
      await surveyInsightWorker.close();
      await surveyDistributionWorker.close();
      await queueManager.close();
      await embeddingQueue?.close();
      await surveyQueueManager.close();
      process.exit(0);
    });
  } catch (error) {
    log.error({ err: error }, 'failed to start worker');
    process.exit(1);
  }
}

startWorker();
