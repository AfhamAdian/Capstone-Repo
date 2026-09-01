import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Not source: build output, deps, coverage, and ad-hoc root helper scripts.
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'chk2.mts',
      'patch.js',
      'test-db-connection.js',
      'test-db-connection.cjs',
      'test-supabase.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Everything here runs on Node — give every file the Node + ES2021 globals.
    languageOptions: {
      globals: { ...globals.node, ...globals.es2021 },
    },
  },
  {
    files: ['**/*.{ts,mts}'],
    rules: {
      // `_`-prefixed args/vars are an intentional "unused on purpose" marker used throughout.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Pre-existing patterns across the codebase. Surfaced as warnings so `lint`
      // stays green today; tighten to 'error' once the existing hits are cleared.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-namespace': 'warn',
      // New-in-ESLint-10 stylistic rule (wants { cause } on every rethrow).
      'preserve-caught-error': 'warn',
    },
  },
  {
    // Config/tooling files run under Node and aren't part of the tsconfig project.
    files: ['*.config.{js,ts,mts}'],
    languageOptions: { globals: { ...globals.node } },
  },
);
