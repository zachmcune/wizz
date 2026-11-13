import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

// v2 flat ESLint config.
//
// The critical rule is the DETERMINISM GUARD on src/sim: the simulation must stay pure and
// headless so that saves, replays and lockstep multiplayer reproduce identically. It may not
// import rendering / UI / audio / input / storage / app layers, and it may not touch wall-clock,
// DOM globals, or Math.random. This is the same contract v1 enforces (v1 `eslint.config.js`),
// re-stated here so v2 is self-contained.
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'art/dist/**',
      // Throwaway forensic harnesses from the phase-0 audit. They are documentation of how a
      // claim was measured, not shipped code, and they intentionally violate the sim guard to
      // reproduce v1 behaviour. Not linted.
      'audit/**',
      '*.config.js',
      'vite.config.ts',
      'vitest.config.ts',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-undef': 'off',
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // Node tooling (content generators, migration scripts). Plain ESM JavaScript with Node globals.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // ---------------------------------------------------------------- DETERMINISM GUARD
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'pixi.js', message: 'The sim core must not import rendering code (pixi.js).' },
            { name: 'idb-keyval', message: 'The sim core must not import storage code.' },
          ],
          patterns: [
            {
              group: [
                '**/render/**',
                '**/ui/**',
                '**/audio/**',
                '**/input/**',
                '**/storage/**',
                '**/ai/**',
                '**/app/**',
                '**/net/**',
              ],
              message:
                'The sim core must not import render/ui/audio/input/storage/ai/app/net layers.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'The sim must be headless: no window.' },
        { name: 'document', message: 'The sim must be headless: no document.' },
        { name: 'performance', message: 'The sim must be deterministic: use state.tick, not wall-clock.' },
        { name: 'requestAnimationFrame', message: 'The sim must be headless: no rAF.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'The sim must use the seeded PRNG, not Math.random().' },
        { object: 'Date', property: 'now', message: 'The sim must be deterministic: no Date.now().' },
      ],
    },
  },
];
