import { buildActionEmbeddingText, hashEmbeddingText } from '@libs/embeddings/index.js';
import { logger } from '@libs/logger.js';
import { ActionEmbeddingQueue } from '@libs/queue/index.js';
import { env } from '../config/env.js';
import { upsertPendingActionEmbedding } from '../database/action-embeddings.js';
import {
  insertAction,
  updateActionRecord,
  type ActionRow,
  type ActionScope,
  type InsertActionInput,
  type UpdateActionInput,
} from '../database/actions.js';

const log = logger.child({ component: 'actions-service' });
let embeddingQueue: ActionEmbeddingQueue | null | undefined;

function getEmbeddingQueue(): ActionEmbeddingQueue | null {
  if (embeddingQueue !== undefined) return embeddingQueue;
  if (!env.isSemanticSearchConfigured || !env.redisUrl) {
    embeddingQueue = null;
    return embeddingQueue;
  }
  embeddingQueue = new ActionEmbeddingQueue({ redisUrl: env.redisUrl });
  return embeddingQueue;
}

export async function prepareAndQueueActionEmbedding(action: ActionRow): Promise<boolean> {
  if (
    !env.isSemanticSearchConfigured
    || !env.geminiEmbeddingModel
    || env.geminiEmbeddingDimensions <= 0
  ) {
    return false;
  }

  const content = buildActionEmbeddingText({
    problem: action.problem,
    reason: action.reason,
    actionTaken: action.action_taken,
  });

  try {
    await upsertPendingActionEmbedding({
      actionId: action.id,
      embeddingVersion: env.actionEmbeddingVersion,
      model: env.geminiEmbeddingModel,
      dimensions: env.geminiEmbeddingDimensions,
      contentHash: hashEmbeddingText(content),
    });
  } catch (error) {
    log.warn({ err: error, actionId: action.id }, 'action logged but embedding state could not be prepared');
    return false;
  }

  const queue = getEmbeddingQueue();
  if (!queue) {
    log.warn({ actionId: action.id }, 'embedding remains pending because Redis is unavailable');
    return false;
  }

  try {
    await queue.enqueue({
      actionId: action.id,
      embeddingVersion: env.actionEmbeddingVersion,
    });
    return true;
  } catch (error) {
    // The producer disables endless Redis reconnects so action creation stays
    // responsive. Recreate it on the next action in case Redis has recovered.
    embeddingQueue = undefined;
    log.warn({ err: error, actionId: action.id }, 'action logged but embedding could not be queued');
    return false;
  }
}

export async function createAction(input: InsertActionInput): Promise<ActionRow> {
  const action = await insertAction(input);
  await prepareAndQueueActionEmbedding(action);
  return action;
}

export async function updateAction(
  id: string,
  scope: ActionScope,
  input: UpdateActionInput,
): Promise<ActionRow | null> {
  const action = await updateActionRecord(id, scope, input);
  if (action) await prepareAndQueueActionEmbedding(action);
  return action;
}
