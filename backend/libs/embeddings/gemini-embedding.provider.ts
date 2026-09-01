import {
  EmbeddingProviderError,
  validateEmbeddingVectors,
  type EmbeddingProvider,
} from './embedding-provider.js';

export interface GeminiEmbeddingConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  dimensions: number;
  timeoutMs: number;
}

type FetchImplementation = typeof fetch;

function extractVectors(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return undefined;
  const embeddings = (payload as Record<string, unknown>).embeddings;
  if (!Array.isArray(embeddings)) return undefined;
  return embeddings.map((item) => {
    if (!item || typeof item !== 'object') return undefined;
    return (item as Record<string, unknown>).values;
  });
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new EmbeddingProviderError('Gemini returned an embedding with zero magnitude', false);
  }
  return vector.map((value) => value / magnitude);
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly provider = 'gemini';
  readonly model: string;
  readonly dimensions: number;

  constructor(
    private readonly config: GeminiEmbeddingConfig,
    private readonly fetchImpl: FetchImplementation = fetch,
  ) {
    this.model = config.model.replace(/^models\//, '');
    this.dimensions = config.dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0 || texts.some((text) => text.trim().length === 0)) {
      throw new EmbeddingProviderError('Embedding inputs must be non-empty strings', false);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const endpoint = this.config.endpoint.replace(/\/$/, '');
      const response = await this.fetchImpl(
        `${endpoint}/models/${encodeURIComponent(this.model)}:batchEmbedContents`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'x-goog-api-key': this.config.apiKey,
          },
          body: JSON.stringify({
            requests: texts.map((text) => ({
              model: `models/${this.model}`,
              content: { parts: [{ text }] },
              taskType: 'SEMANTIC_SIMILARITY',
              outputDimensionality: this.dimensions,
            })),
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new EmbeddingProviderError(
          `Gemini embedding request failed with status ${response.status}`,
          retryable,
          response.status,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json() as unknown;
      } catch {
        throw new EmbeddingProviderError('Gemini returned invalid JSON', false);
      }
      const vectors = validateEmbeddingVectors(extractVectors(payload), texts.length, this.dimensions);
      // gemini-embedding-001 does not normalize truncated (<3072D) vectors.
      // L2 normalization preserves cosine similarity and follows Google's guidance.
      return vectors.map(normalizeVector);
    } catch (error) {
      if (error instanceof EmbeddingProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new EmbeddingProviderError('Gemini embedding request timed out', true);
      }
      throw new EmbeddingProviderError('Gemini embedding request failed', true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
