export interface RerankDocument {
  id: string;
  text: string;
}

export interface RerankResult {
  id: string;
  score: number;
}

export interface PineconeRerankerOptions {
  apiKey: string;
  endpoint: string;
  model: string;
  timeoutMs: number;
}

type PineconeRerankResponse = {
  data?: Array<{ index?: unknown; score?: unknown }>;
};

/** Small HTTP adapter for Pinecone Inference; provider response bodies are never exposed in errors. */
export class PineconeReranker {
  constructor(private readonly options: PineconeRerankerOptions) {}

  async rerank(query: string, documents: RerankDocument[]): Promise<RerankResult[]> {
    if (documents.length === 0) return [];
    if (documents.length > 100) throw new Error('Pinecone reranking supports at most 100 documents per request');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await fetch(this.options.endpoint, {
        method: 'POST',
        headers: {
          'Api-Key': this.options.apiKey,
          'Content-Type': 'application/json',
          'X-Pinecone-Api-Version': '2025-04',
        },
        body: JSON.stringify({
          model: this.options.model,
          query,
          documents: documents.map(({ id, text }) => ({ id, text })),
          top_n: documents.length,
          return_documents: false,
          parameters: { truncate: 'END' },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Pinecone reranking failed with HTTP ${response.status}`);

      const payload = await response.json() as PineconeRerankResponse;
      if (!Array.isArray(payload.data)) throw new Error('Pinecone returned an invalid reranking response');

      return payload.data.map((item) => {
        if (!Number.isInteger(item.index) || (item.index as number) < 0 || (item.index as number) >= documents.length) {
          throw new Error('Pinecone returned an invalid document index');
        }
        if (typeof item.score !== 'number' || !Number.isFinite(item.score)) {
          throw new Error('Pinecone returned an invalid relevance score');
        }
        return { id: documents[item.index as number]!.id, score: item.score };
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('Pinecone reranking timed out');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
