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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // Report every source file, not just ones a test happened to import -
      // that's what makes untested modules (risk-engines, connectors, ...)
      // show up as 0% instead of being silently omitted from the total.
      all: true,
      include: ['apps/**/*.ts', 'libs/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@libs': path.resolve(__dirname, 'libs'),
    },
  },
});
