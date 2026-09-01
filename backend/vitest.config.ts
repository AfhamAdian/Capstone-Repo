import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // These three are node:test suites (run via `npm run test:actions`), not vitest.
    // vitest would otherwise collect them and fail with "No test suite found".
    exclude: [
      'node_modules',
      'dist',
      'tests/action-search.test.ts',
      'tests/embeddings.test.ts',
      'tests/pinecone-reranker.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@libs': path.resolve(__dirname, 'libs'),
    },
  },
});
