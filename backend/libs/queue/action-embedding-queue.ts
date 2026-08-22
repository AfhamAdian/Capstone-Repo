import { Job, Queue, Worker } from 'bullmq';

export interface ActionEmbeddingJobData {
  actionId: string;
  embeddingVersion: string;
}

export interface ActionEmbeddingQueueConfig {
  redisUrl: string;
  concurrency?: number;
}

function jobIdFor(data: ActionEmbeddingJobData): string {
  const safeVersion = data.embeddingVersion.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${data.actionId}__${safeVersion}`;
}

export class ActionEmbeddingQueue {
  private readonly queue: Queue<ActionEmbeddingJobData>;

  constructor(private readonly config: ActionEmbeddingQueueConfig) {
    this.queue = new Queue<ActionEmbeddingJobData>('action-embeddings', {
      connection: {
        url: config.redisUrl,
        connectTimeout: 2_000,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        // API producers must fail promptly when Redis is down. A later request
        // creates a fresh producer connection after an enqueue failure.
        retryStrategy: () => null,
      },
    });
    this.queue.on('error', () => {
      // Individual queue operations surface their errors to the caller, where
      // they are logged with action context and kept off the response path.
    });
  }

  async enqueue(data: ActionEmbeddingJobData): Promise<string> {
    const requestedJobId = jobIdFor(data);
    const existing = await this.queue.getJob(requestedJobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') {
        await existing.remove();
      } else {
        return existing.id ?? requestedJobId;
      }
    }

    const job = await this.queue.add('embed-action', data, {
      jobId: requestedJobId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
    return job.id ?? requestedJobId;
  }

  createWorker(
    processor: (job: Job<ActionEmbeddingJobData>) => Promise<void>,
  ): Worker<ActionEmbeddingJobData> {
    return new Worker<ActionEmbeddingJobData>('action-embeddings', processor, {
      connection: {
        url: this.config.redisUrl,
        connectTimeout: 2_000,
        maxRetriesPerRequest: null,
      },
      concurrency: this.config.concurrency ?? 4,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
