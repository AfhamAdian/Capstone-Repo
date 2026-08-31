import { buildActionEmbeddingText } from '@libs/embeddings/embedding-text.js';
import { logger } from '@libs/logger.js';
import { PineconeReranker } from '@libs/reranking/pinecone-reranker.js';
import {
  listActions,
  searchActions as searchActionsLexically,
  type ActionSearchRow,
} from '../database/actions.js';
import { env } from '../config/env.js';

export type ActionSearchMode = 'rerank' | 'lexical';

export interface ActionSearchResult {
  rows: ActionSearchRow[];
  mode: ActionSearchMode;
}

export class ActionRerankingUnavailableError extends Error {
  constructor(message = 'Deep action search is unavailable') {
    super(message);
    this.name = 'ActionRerankingUnavailableError';
  }
}

const log = logger.child({ component: 'action-search-service' });

function configuredReranker(): PineconeReranker | null {
  if (!env.isActionRerankConfigured || !env.pineconeApiKey) return null;
  return new PineconeReranker({
    apiKey: env.pineconeApiKey,
    endpoint: env.pineconeRerankUrl,
    model: env.pineconeRerankModel,
    timeoutMs: env.pineconeRerankTimeoutMs,
  });
}

export async function searchActions(input: {
  query: string;
  limit: number;
  companyId: number;
  ownerUserId?: number;
  projectId?: string;
  deep?: boolean;
  excludeActionId?: string;
}): Promise<ActionSearchResult> {
  const scope = { companyId: input.companyId, ownerUserId: input.ownerUserId };
  if (!input.deep) {
    const rows = await searchActionsLexically(input.query, input.limit, scope, input.projectId);
    return { rows, mode: 'lexical' };
  }

  const reranker = configuredReranker();
  if (!reranker) throw new ActionRerankingUnavailableError('Deep action search is not configured');

  const candidates = (await listActions({
    ...scope,
    projectId: input.projectId,
    limit: env.pineconeRerankCandidateLimit,
  })).filter((row) => row.id !== input.excludeActionId);
  if (candidates.length === 0) return { rows: [], mode: 'rerank' };

  try {
    const startedAt = Date.now();
    const ranked = await reranker.rerank(input.query, candidates.map((row) => ({
      id: row.id,
      text: buildActionEmbeddingText({
        problem: row.problem,
        reason: row.reason,
        actionTaken: row.action_taken,
      }),
    })));
    const rowsById = new Map(candidates.map((row) => [row.id, row]));
    const rows = ranked
      .filter(({ score }) => score >= env.pineconeRerankMinScore)
      .slice(0, input.limit)
      .flatMap(({ id, score }) => {
        const row = rowsById.get(id);
        return row ? [{ ...row, similarity: score }] : [];
      });

    log.info({
      elapsedMs: Date.now() - startedAt,
      candidateCount: candidates.length,
      resultCount: rows.length,
      model: env.pineconeRerankModel,
      minScore: env.pineconeRerankMinScore,
    }, 'completed Pinecone action reranking');
    return { rows, mode: 'rerank' };
  } catch (error) {
    log.warn({ err: error }, 'Pinecone action reranking unavailable');
    throw new ActionRerankingUnavailableError();
  }
}
