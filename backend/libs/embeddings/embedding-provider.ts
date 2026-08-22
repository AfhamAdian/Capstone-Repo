export interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export class EmbeddingProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EmbeddingProviderError';
  }
}

export function validateEmbeddingVectors(
  value: unknown,
  expectedCount: number,
  expectedDimensions: number,
): number[][] {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw new EmbeddingProviderError(
      `Embedding provider returned ${Array.isArray(value) ? value.length : 0} vectors; expected ${expectedCount}`,
      false,
    );
  }

  return value.map((candidate, vectorIndex) => {
    if (!Array.isArray(candidate) || candidate.length !== expectedDimensions) {
      throw new EmbeddingProviderError(
        `Embedding ${vectorIndex} has ${Array.isArray(candidate) ? candidate.length : 0} dimensions; expected ${expectedDimensions}`,
        false,
      );
    }

    return candidate.map((component, componentIndex) => {
      if (typeof component !== 'number' || !Number.isFinite(component)) {
        throw new EmbeddingProviderError(
          `Embedding ${vectorIndex} contains a non-finite value at position ${componentIndex}`,
          false,
        );
      }
      return component;
    });
  });
}
