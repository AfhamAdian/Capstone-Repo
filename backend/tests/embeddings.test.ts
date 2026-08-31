import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EmbeddingProviderError,
  GeminiEmbeddingProvider,
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

test('Gemini provider sends semantic-similarity batch requests and normalizes embeddings', async () => {
  let capturedBody = '';
  let capturedApiKey = '';
  let capturedUrl = '';
  const provider = new GeminiEmbeddingProvider({
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/',
    apiKey: 'test-only-key',
    model: 'gemini-embedding-001',
    dimensions: 3,
    timeoutMs: 1_000,
  }, async (input, init) => {
    capturedUrl = String(input);
    capturedBody = String(init?.body);
    capturedApiKey = new Headers(init?.headers).get('x-goog-api-key') ?? '';
    return new Response(JSON.stringify({ embeddings: [{ values: [3, 4, 0] }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  assert.deepEqual(await provider.embed(['hello']), [[0.6, 0.8, 0]]);
  assert.equal(
    capturedUrl,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents',
  );
  assert.deepEqual(JSON.parse(capturedBody), {
    requests: [{
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text: 'hello' }] },
      taskType: 'SEMANTIC_SIMILARITY',
      outputDimensionality: 3,
    }],
  });
  assert.equal(capturedApiKey, 'test-only-key');
});

test('Gemini provider marks rate limits as retryable without leaking response bodies', async () => {
  const provider = new GeminiEmbeddingProvider({
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: 'test-only-key',
    model: 'gemini-embedding-001',
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

test('Gemini provider marks authentication and request errors as non-retryable', async () => {
  const provider = new GeminiEmbeddingProvider({
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: 'test-only-key',
    model: 'gemini-embedding-001',
    dimensions: 3,
    timeoutMs: 1_000,
  }, async () => new Response('credential detail that must not leak', { status: 403 }));

  await assert.rejects(provider.embed(['hello']), (error: unknown) => {
    assert.ok(error instanceof EmbeddingProviderError);
    assert.equal(error.retryable, false);
    assert.equal(error.status, 403);
    assert.doesNotMatch(error.message, /credential detail/);
    return true;
  });
});
