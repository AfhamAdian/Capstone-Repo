import { GeminiEmbeddingProvider } from '@libs/embeddings/index.js';
import { logger } from '@libs/logger.js';
import { matchActionsByEmbedding } from '../database/action-embeddings.js';
import {
  searchActions as searchActionsLexically,
  type ActionRow,
  type ActionSearchRow,
} from '../database/actions.js';
import { env } from '../config/env.js';

export type ActionSearchMode = 'hybrid' | 'semantic' | 'lexical';

export interface ActionSearchResult {
  rows: ActionSearchRow[];
  mode: ActionSearchMode;
}

const RRF_K = 60;
const log = logger.child({ component: 'action-search-service' });

function configuredProvider(): GeminiEmbeddingProvider | null {
  if (
    !env.isSemanticSearchConfigured
    || !env.geminiEmbeddingsUrl
    || !env.geminiApiKey
    || !env.geminiEmbeddingModel
    || env.geminiEmbeddingDimensions <= 0
  ) {
    return null;
  }

  return new GeminiEmbeddingProvider({
    endpoint: env.geminiEmbeddingsUrl,
    apiKey: env.geminiApiKey,
    model: env.geminiEmbeddingModel,
    dimensions: env.geminiEmbeddingDimensions,
    timeoutMs: env.actionEmbeddingTimeoutMs,
  });
}

export function fuseActionSearchResults(
  semanticRows: ActionSearchRow[],
  lexicalRows: ActionRow[],
  limit: number,
): ActionSearchRow[] {
  const scores = new Map<string, { row: ActionSearchRow; score: number; bestRank: number }>();

  const add = (row: ActionSearchRow, rank: number) => {
    const current = scores.get(row.id);
    const contribution = 1 / (RRF_K + rank + 1);
    if (current) {
      current.score += contribution;
      current.bestRank = Math.min(current.bestRank, rank);
      if (row.similarity !== undefined) current.row.similarity = row.similarity;
      return;
    }
    scores.set(row.id, { row: { ...row }, score: contribution, bestRank: rank });
  };

  semanticRows.forEach(add);
  lexicalRows.forEach(add);

  return [...scores.values()]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const similarityDifference = (right.row.similarity ?? -1) - (left.row.similarity ?? -1);
      if (similarityDifference !== 0) return similarityDifference;
      if (left.bestRank !== right.bestRank) return left.bestRank - right.bestRank;
      return right.row.action_date.localeCompare(left.row.action_date);
    })
    .slice(0, limit)
    .map(({ row }) => row);
}

export async function searchActions(input: {
  query: string;
  limit: number;
  companyId: number;
  ownerUserId?: number;
  projectId?: string;
}): Promise<ActionSearchResult> {
  const candidateLimit = Math.min(Math.max(input.limit * 4, 20), 100);
  const lexicalPromise = searchActionsLexically(
    input.query,
    candidateLimit,
    { companyId: input.companyId, ownerUserId: input.ownerUserId },
    input.projectId,
  );
  const provider = configuredProvider();

  if (!provider) {
    return { rows: (await lexicalPromise).slice(0, input.limit), mode: 'lexical' };
  }

  try {
    const startedAt = Date.now();
    const [queryEmbedding] = await provider.embed([input.query]);
    if (!queryEmbedding) throw new Error('Gemini returned no query embedding');

    const semanticRows = await matchActionsByEmbedding({
      embedding: queryEmbedding,
      embeddingVersion: env.actionEmbeddingVersion,
      threshold: env.actionSearchMinSimilarity,
      limit: candidateLimit,
      companyId: input.companyId,
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });

    let lexicalRows: ActionRow[] = [];
    try {
      lexicalRows = await lexicalPromise;
    } catch (error) {
      log.warn({ err: error }, 'lexical branch failed; returning semantic results');
    }

    log.info({
      elapsedMs: Date.now() - startedAt,
      semanticCount: semanticRows.length,
      lexicalCount: lexicalRows.length,
      provider: provider.provider,
      model: provider.model,
    }, 'completed hybrid action search');

    if (semanticRows.length === 0) {
      return { rows: lexicalRows.slice(0, input.limit), mode: 'lexical' };
    }

    if (lexicalRows.length === 0) {
      return { rows: semanticRows.slice(0, input.limit), mode: 'semantic' };
    }

    return {
      rows: fuseActionSearchResults(semanticRows, lexicalRows, input.limit),
      mode: 'hybrid',
    };
  } catch (error) {
    log.warn({ err: error }, 'semantic action search unavailable; using lexical fallback');
    return { rows: (await lexicalPromise).slice(0, input.limit), mode: 'lexical' };
  }
}
