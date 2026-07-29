/**
 * Worker Process Entrypoint
 * Runs separately from the API to process sync jobs asynchronously
 */

import dotenv from 'dotenv';
import express from 'express';
import { QueueManager, SurveyQueueManager } from '@libs/queue/index.js';
import { processSyncJob } from './processors/sync-processor.js';
import { processSurveySendJob } from './processors/survey-send-processor.js';
import { processSurveyInsightJob } from './processors/survey-insight-processor.js';
import { processSurveyDistributionJob } from './processors/survey-distribution-processor.js';
import { logger } from '@libs/logger.js';

dotenv.config();

const redisUrl = process.env.REDIS_URL;
const port = process.env.PORT || 4000;

if (!redisUrl) {
  console.error('REDIS_URL is required to start the worker');
  process.exit(1);
}

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
  const queueManager = new QueueManager({ redisUrl: redisUrl! });
  const surveyQueueManager = new SurveyQueueManager({ redisUrl: redisUrl! });
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

    const surveyLog = logger.child({ component: 'survey-send-worker' });
    const surveySendWorker = surveyQueueManager.createSurveySendWorker(async (job) => {
      surveyLog.info({ surveyId: job.data.surveyId }, 'processing survey-send job');
      await processSurveySendJob(job.data);
      surveyLog.info({ surveyId: job.data.surveyId }, 'completed survey-send job');
    });
    surveySendWorker.on('failed', (job, error) => {
      surveyLog.error({ surveyId: job?.data.surveyId, err: error }, 'survey-send job failed');
    });
    surveyLog.info('survey-send worker is running');

    const insightLog = logger.child({ component: 'survey-insight-worker' });
    const surveyInsightWorker = surveyQueueManager.createSurveyInsightWorker(async (job) => {
      insightLog.info({ surveyId: job.data.surveyId }, 'processing survey-insight job');
      await processSurveyInsightJob(job.data);
      insightLog.info({ surveyId: job.data.surveyId }, 'completed survey-insight job');
    });
    surveyInsightWorker.on('failed', (job, error) => {
      insightLog.error({ surveyId: job?.data.surveyId, err: error }, 'survey-insight job failed');
    });
    insightLog.info('survey-insight worker is running');

    const distributionLog = logger.child({ component: 'survey-distribution-worker' });
    const surveyDistributionWorker = surveyQueueManager.createSurveyDistributionWorker(async () => {
      distributionLog.info('processing survey-distribution job');
      await processSurveyDistributionJob();
      distributionLog.info('completed survey-distribution job');
    });
    surveyDistributionWorker.on('failed', (job, error) => {
      distributionLog.error({ jobId: job?.id, err: error }, 'survey-distribution job failed');
    });
    // Hourly tick: assigns each project's randomized per-round send moment when its
    // window opens (day SURVEY_ROUND1_START_DAY / ROUND2_START_DAY), generates
    // questions SURVEY_QUESTION_GEN_LEAD_DAYS before that moment, and auto-sends
    // (no approval gate) once it arrives. Idempotent - safe to call on every boot.
    await surveyQueueManager.scheduleSurveyDistribution('0 * * * *');
    distributionLog.info('survey-distribution worker is running (hourly tick, staggered per-project send)');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      log.info('received SIGTERM, shutting down gracefully');
      await worker.close();
      await surveySendWorker.close();
      await surveyInsightWorker.close();
      await surveyDistributionWorker.close();
      await queueManager.close();
      await surveyQueueManager.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      log.info('received SIGINT, shutting down gracefully');
      await worker.close();
      await surveySendWorker.close();
      await surveyInsightWorker.close();
      await surveyDistributionWorker.close();
      await queueManager.close();
      await surveyQueueManager.close();
      process.exit(0);
    });
  } catch (error) {
    log.error({ err: error }, 'failed to start worker');
    process.exit(1);
  }
}

startWorker();
