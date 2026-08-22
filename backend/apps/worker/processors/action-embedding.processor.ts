import {
  EmbeddingProviderError,
  SiliconFlowEmbeddingProvider,
  buildActionEmbeddingText,
  hashEmbeddingText,
} from '@libs/embeddings/index.js';
import type { ActionEmbeddingJobData } from '@libs/queue/index.js';
import { logger } from '@libs/logger.js';
import { UnrecoverableError } from 'bullmq';
import { env } from '../../api/config/env.js';
import {
  claimActionEmbedding,
  completeActionEmbedding,
  failActionEmbedding,
} from '../../api/database/action-embeddings.js';
import { getActionById } from '../../api/database/actions.js';

const log = logger.child({ component: 'action-embedding-processor' });
let provider: SiliconFlowEmbeddingProvider | undefined;

function getProvider(): SiliconFlowEmbeddingProvider {
  if (provider) return provider;
  if (
    !env.isSemanticSearchConfigured
    || !env.siliconFlowEmbeddingsUrl
    || !env.siliconFlowApiKey
    || !env.siliconFlowEmbeddingModel
    || env.siliconFlowEmbeddingDimensions <= 0
  ) {
    throw new Error('SiliconFlow embeddings are not configured');
  }

  provider = new SiliconFlowEmbeddingProvider({
    endpoint: env.siliconFlowEmbeddingsUrl,
    apiKey: env.siliconFlowApiKey,
    authHeader: env.siliconFlowAuthHeader,
    authScheme: env.siliconFlowAuthScheme,
    model: env.siliconFlowEmbeddingModel,
    dimensions: env.siliconFlowEmbeddingDimensions,
    timeoutMs: env.actionEmbeddingTimeoutMs,
  });
  return provider;
}

export async function processActionEmbeddingJob(jobData: ActionEmbeddingJobData): Promise<void> {
  const jobLog = log.child({ actionId: jobData.actionId, embeddingVersion: jobData.embeddingVersion });
  const claimed = await claimActionEmbedding(jobData.actionId, jobData.embeddingVersion);
  if (!claimed) {
    jobLog.info('embedding job was already claimed or completed');
    return;
  }

  try {
    if (jobData.embeddingVersion !== env.actionEmbeddingVersion) {
      throw new Error(`Embedding version ${jobData.embeddingVersion} is not active`);
    }

    const action = await getActionById(jobData.actionId);
    if (!action) {
      jobLog.info('action no longer exists; skipping embedding');
      return;
    }

    const content = buildActionEmbeddingText({
      problem: action.problem,
      reason: action.reason,
      actionTaken: action.action_taken,
    });
    const contentHash = hashEmbeddingText(content);
    const embeddingProvider = getProvider();
    const startedAt = Date.now();
    const [embedding] = await embeddingProvider.embed([content]);
    if (!embedding) throw new Error('SiliconFlow returned no action embedding');

    await completeActionEmbedding({
      actionId: action.id,
      embeddingVersion: jobData.embeddingVersion,
      model: embeddingProvider.model,
      dimensions: embeddingProvider.dimensions,
      contentHash,
      embedding,
    });

    jobLog.info({
      elapsedMs: Date.now() - startedAt,
      provider: embeddingProvider.provider,
      model: embeddingProvider.model,
      dimensions: embeddingProvider.dimensions,
    }, 'action embedding stored');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Action embedding failed';
    try {
      await failActionEmbedding(jobData.actionId, jobData.embeddingVersion, message);
    } catch (statusError) {
      jobLog.error({ err: statusError }, 'failed to record embedding failure');
    }
    if (error instanceof EmbeddingProviderError && !error.retryable) {
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }
}
