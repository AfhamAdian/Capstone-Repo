import { ActionEmbeddingQueue } from '@libs/queue/index.js';
import { buildActionEmbeddingText, hashEmbeddingText } from '@libs/embeddings/index.js';
import { env } from '../apps/api/src/config/env.js';
import {
  getActionEmbedding,
  listActionsForEmbedding,
  listRetryableActionEmbeddings,
  resetStaleActionEmbeddings,
  upsertPendingActionEmbedding,
} from '../apps/api/src/database/action-embeddings.js';

function positiveArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main(): Promise<void> {
  if (
    !env.isSemanticSearchConfigured
    || !env.siliconFlowEmbeddingModel
    || env.siliconFlowEmbeddingDimensions <= 0
  ) {
    throw new Error(
      'Set SILICONFLOW_API_KEY (and optionally override the SiliconFlow endpoint/model/dimensions) first.',
    );
  }

  const dryRun = process.argv.includes('--dry-run');
  const limit = Math.min(positiveArg('limit', 1_000), 10_000);
  const staleMinutes = positiveArg('stale-minutes', 15);
  const actions = await listActionsForEmbedding(limit);
  let prepared = 0;
  let skipped = 0;

  const queue = !dryRun && env.redisUrl
    ? new ActionEmbeddingQueue({ redisUrl: env.redisUrl })
    : null;

  try {
    for (const action of actions) {
      const content = buildActionEmbeddingText({
        problem: action.problem,
        reason: action.reason,
        actionTaken: action.action_taken,
      });
      const contentHash = hashEmbeddingText(content);
      const existing = await getActionEmbedding(action.id, env.actionEmbeddingVersion);

      if (
        existing?.status === 'ready'
        && existing.content_hash === contentHash
        && existing.model === env.siliconFlowEmbeddingModel
        && existing.dimensions === env.siliconFlowEmbeddingDimensions
      ) {
        skipped += 1;
        continue;
      }

      prepared += 1;
      if (dryRun) continue;

      await upsertPendingActionEmbedding({
        actionId: action.id,
        embeddingVersion: env.actionEmbeddingVersion,
        model: env.siliconFlowEmbeddingModel,
        dimensions: env.siliconFlowEmbeddingDimensions,
        contentHash,
      });
      await queue?.enqueue({ actionId: action.id, embeddingVersion: env.actionEmbeddingVersion });
    }

    // Also recover pending/failed rows that may have missed their original Redis enqueue.
    if (queue) {
      await resetStaleActionEmbeddings(
        env.actionEmbeddingVersion,
        new Date(Date.now() - staleMinutes * 60_000),
      );
      const retryable = await listRetryableActionEmbeddings(env.actionEmbeddingVersion, limit);
      for (const row of retryable) {
        await queue.enqueue({ actionId: row.action_id, embeddingVersion: row.embedding_version });
      }
    }

    console.log(JSON.stringify({
      dryRun,
      scanned: actions.length,
      prepared,
      skipped,
      queued: queue ? prepared : 0,
      embeddingVersion: env.actionEmbeddingVersion,
      model: env.siliconFlowEmbeddingModel,
      dimensions: env.siliconFlowEmbeddingDimensions,
    }, null, 2));
  } finally {
    await queue?.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
