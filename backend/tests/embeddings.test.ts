import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EmbeddingProviderError,
  SiliconFlowEmbeddingProvider,
  buildActionEmbeddingText,
  hashEmbeddingText,
  validateEmbeddingVectors,
} from '../libs/embeddings/index.js';

test('buildActionEmbeddingText creates stable labeled content', () => {
  const text = buildActionEmbeddingText({
    problem: '  Velocity dropped\r\nquickly  ',
    reason: 'Team changed',
    actionTaken: 'Reduced scope',
  });

  assert.equal(
    text,
    'Problem: Velocity dropped\nquickly\nRoot cause: Team changed\nAction taken: Reduced scope',
  );
  assert.equal(hashEmbeddingText(text), hashEmbeddingText(text));
  assert.notEqual(hashEmbeddingText(text), hashEmbeddingText(`${text}.`));
});

test('validateEmbeddingVectors rejects wrong dimensions and non-finite values', () => {
  assert.deepEqual(validateEmbeddingVectors([[0.1, 0.2]], 1, 2), [[0.1, 0.2]]);
  assert.throws(() => validateEmbeddingVectors([[0.1]], 1, 2), EmbeddingProviderError);
  assert.throws(() => validateEmbeddingVectors([[Number.NaN, 0.2]], 1, 2), EmbeddingProviderError);
});

test('SiliconFlow provider uses its OpenAI-compatible request and parses data embeddings', async () => {
  let capturedBody = '';
  let capturedAuthorization = '';
  const provider = new SiliconFlowEmbeddingProvider({
    endpoint: 'http://siliconflow.local/v1/embeddings',
    apiKey: 'test-only-key',
    model: 'BAAI/bge-large-en-v1.5',
    dimensions: 3,
    timeoutMs: 1_000,
  }, async (_input, init) => {
    capturedBody = String(init?.body);
    capturedAuthorization = new Headers(init?.headers).get('authorization') ?? '';
    return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  assert.deepEqual(await provider.embed(['hello']), [[0.1, 0.2, 0.3]]);
  assert.deepEqual(JSON.parse(capturedBody), {
    model: 'BAAI/bge-large-en-v1.5',
    input: ['hello'],
    encoding_format: 'float',
  });
  assert.equal(capturedAuthorization, 'Bearer test-only-key');
});

test('SiliconFlow provider marks rate limits as retryable without leaking response bodies', async () => {
  const provider = new SiliconFlowEmbeddingProvider({
    endpoint: 'http://siliconflow.local/v1/embeddings',
    apiKey: 'test-only-key',
    model: 'BAAI/bge-large-en-v1.5',
    dimensions: 3,
    timeoutMs: 1_000,
  }, async () => new Response('secret provider detail', { status: 429 }));

  await assert.rejects(provider.embed(['hello']), (error: unknown) => {
    assert.ok(error instanceof EmbeddingProviderError);
    assert.equal(error.retryable, true);
    assert.equal(error.status, 429);
    assert.doesNotMatch(error.message, /secret provider detail/);
    return true;
  });
});

test('SiliconFlow provider marks account and request errors as non-retryable', async () => {
  const provider = new SiliconFlowEmbeddingProvider({
    endpoint: 'http://siliconflow.local/v1/embeddings',
    apiKey: 'test-only-key',
    model: 'Qwen/Qwen3-Embedding-0.6B',
    dimensions: 3,
    timeoutMs: 1_000,
  }, async () => new Response('account detail that must not leak', { status: 402 }));

  await assert.rejects(provider.embed(['hello']), (error: unknown) => {
    assert.ok(error instanceof EmbeddingProviderError);
    assert.equal(error.retryable, false);
    assert.equal(error.status, 402);
    assert.doesNotMatch(error.message, /account detail/);
    return true;
  });
});
