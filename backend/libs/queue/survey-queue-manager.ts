/**
 * BullMQ queue manager for the survey feature's background jobs.
 * Kept separate from the existing sync-only QueueManager (queue-manager.ts)
 * so the survey feature can't destabilize the working sync pipeline.
 */

import { Queue, Worker, type Processor } from 'bullmq';

export interface SurveySendJobData {
  surveyId: number;
}

export interface SurveyInsightJobData {
  surveyId: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SurveyDistributionJobData {
  triggeredAt: string;
}

export interface SurveyQueueConfig {
  redisUrl: string;
}

const SURVEY_SEND_QUEUE = 'survey-send';
const SURVEY_INSIGHT_QUEUE = 'survey-insight';
const SURVEY_DISTRIBUTION_QUEUE = 'survey-distribution';

export class SurveyQueueManager {
  private readonly connection: { url: string };
  private readonly sendQueue: Queue<SurveySendJobData>;
  private readonly insightQueue: Queue<SurveyInsightJobData>;
  private readonly distributionQueue: Queue<SurveyDistributionJobData>;

  constructor(config: SurveyQueueConfig) {
    this.connection = { url: config.redisUrl };
    this.sendQueue = new Queue<SurveySendJobData>(SURVEY_SEND_QUEUE, { connection: this.connection });
    this.insightQueue = new Queue<SurveyInsightJobData>(SURVEY_INSIGHT_QUEUE, { connection: this.connection });
    this.distributionQueue = new Queue<SurveyDistributionJobData>(SURVEY_DISTRIBUTION_QUEUE, { connection: this.connection });
  }

  async enqueueSurveySend(surveyId: number): Promise<void> {
    try {
      await this.sendQueue.add('send', { surveyId }, {
        jobId: `survey-send-${surveyId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: true,
      });
    } catch (error) {
      if (error instanceof Error && /already exists/i.test(error.message)) return;
      throw error;
    }
  }

  async enqueueSurveyInsight(surveyId: number): Promise<void> {
    try {
      await this.insightQueue.add('insight', { surveyId }, {
        jobId: `survey-insight-${surveyId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: true,
      });
    } catch (error) {
      if (error instanceof Error && /already exists/i.test(error.message)) return;
      throw error;
    }
  }

  /** Idempotent: BullMQ dedupes repeatable jobs with the same name+pattern, safe to call on every worker boot. */
  async scheduleSurveyDistribution(cronPattern: string): Promise<void> {
    await this.distributionQueue.add(
      'distribute',
      { triggeredAt: new Date().toISOString() },
      { repeat: { pattern: cronPattern }, removeOnComplete: true, removeOnFail: false },
    );
  }

  createSurveySendWorker(processor: Processor<SurveySendJobData>): Worker<SurveySendJobData> {
    return new Worker<SurveySendJobData>(SURVEY_SEND_QUEUE, processor, { connection: this.connection, concurrency: 2 });
  }

  createSurveyInsightWorker(processor: Processor<SurveyInsightJobData>): Worker<SurveyInsightJobData> {
    return new Worker<SurveyInsightJobData>(SURVEY_INSIGHT_QUEUE, processor, { connection: this.connection, concurrency: 2 });
  }

  createSurveyDistributionWorker(processor: Processor<SurveyDistributionJobData>): Worker<SurveyDistributionJobData> {
    return new Worker<SurveyDistributionJobData>(SURVEY_DISTRIBUTION_QUEUE, processor, { connection: this.connection, concurrency: 1 });
  }

  async close(): Promise<void> {
    await Promise.all([this.sendQueue.close(), this.insightQueue.close(), this.distributionQueue.close()]);
  }
}
