import assert from 'node:assert/strict';
import test from 'node:test';
import { PineconeReranker } from '../libs/reranking/pinecone-reranker.js';

test('Pinecone reranker maps response indexes back to action ids', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      data: [
        { index: 1, score: 0.91 },
        { index: 0, score: 0.32 },
      ],
      usage: { rerank_units: 1 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const reranker = new PineconeReranker({
      apiKey: 'test-key',
      endpoint: 'https://api.pinecone.test/rerank',
      model: 'bge-reranker-v2-m3',
      timeoutMs: 1_000,
    });
    const result = await reranker.rerank('deployment delays', [
      { id: 'action-a', text: 'A' },
      { id: 'action-b', text: 'B' },
    ]);

    assert.deepEqual(result, [
      { id: 'action-b', score: 0.91 },
      { id: 'action-a', score: 0.32 },
    ]);
    assert.equal(requestBody?.model, 'bge-reranker-v2-m3');
    assert.equal(requestBody?.top_n, 2);
    assert.equal(requestBody?.return_documents, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Pinecone reranker rejects malformed scores', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [{ index: 0, score: 'high' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  try {
    const reranker = new PineconeReranker({
      apiKey: 'test-key', endpoint: 'https://api.pinecone.test/rerank',
      model: 'bge-reranker-v2-m3', timeoutMs: 1_000,
    });
    await assert.rejects(() => reranker.rerank('query', [{ id: 'action-a', text: 'A' }]), /invalid relevance score/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
