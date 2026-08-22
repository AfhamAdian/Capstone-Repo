import {
  EmbeddingProviderError,
  validateEmbeddingVectors,
  type EmbeddingProvider,
} from './embedding-provider.js';

export interface SiliconFlowEmbeddingConfig {
  endpoint: string;
  apiKey: string;
  authHeader?: string;
  authScheme?: string;
  model: string;
  dimensions: number;
  timeoutMs: number;
}

type FetchImplementation = typeof fetch;

function extractVectors(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return undefined;

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.embeddings)) return record.embeddings;
  if (Array.isArray(record.embedding)) return [record.embedding];

  if (Array.isArray(record.data)) {
    return record.data
      .map((item, position) => {
        if (!item || typeof item !== 'object') return { index: position, embedding: undefined };
        const embeddingRecord = item as Record<string, unknown>;
        return {
          index: typeof embeddingRecord.index === 'number' ? embeddingRecord.index : position,
          embedding: embeddingRecord.embedding,
        };
      })
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
  }

  return undefined;
}

export class SiliconFlowEmbeddingProvider implements EmbeddingProvider {
  readonly provider = 'siliconflow';
  readonly model: string;
  readonly dimensions: number;

  constructor(
    private readonly config: SiliconFlowEmbeddingConfig,
    private readonly fetchImpl: FetchImplementation = fetch,
  ) {
    this.model = config.model;
    this.dimensions = config.dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0 || texts.some((text) => text.trim().length === 0)) {
      throw new EmbeddingProviderError('Embedding inputs must be non-empty strings', false);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const header = this.config.authHeader?.trim() || 'authorization';
      const scheme = this.config.authScheme?.trim() ?? 'Bearer';
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json',
        [header]: scheme ? `${scheme} ${this.config.apiKey}` : this.config.apiKey,
      };

      const body: Record<string, unknown> = {
        model: this.model,
        input: texts,
        encoding_format: 'float',
      };
      // SiliconFlow only accepts the dimensions field for Qwen3 embedding models.
      if (this.model.startsWith('Qwen/Qwen3-Embedding-')) {
        body.dimensions = this.dimensions;
      }

      const response = await this.fetchImpl(this.config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new EmbeddingProviderError(
          `SiliconFlow embedding request failed with status ${response.status}`,
          retryable,
          response.status,
        );
      }

      const payload = await response.json() as unknown;
      return validateEmbeddingVectors(extractVectors(payload), texts.length, this.dimensions);
    } catch (error) {
      if (error instanceof EmbeddingProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new EmbeddingProviderError('SiliconFlow embedding request timed out', true);
      }
      throw new EmbeddingProviderError('SiliconFlow embedding request failed', true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
