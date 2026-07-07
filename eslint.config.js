import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

// Flat ESLint config. The critical rule here is the import guard on src/sim:
// the deterministic simulation core must never import rendering, DOM, or asset code.
export default [
  {
    ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'scripts/**', '*.config.js', 'vite.config.ts', 'vitest.config.ts'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        HTMLElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        PointerEvent: 'readonly',
        WheelEvent: 'readonly',
        AudioContext: 'readonly',
        Worker: 'readonly',
        self: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-undef': 'off',
    },
  },
  {
    // DETERMINISM GUARD: the sim must stay pure and headless.
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
            { group: ['../render/*', '../ui/*', '../audio/*', '../input/*', '../storage/*'], message: 'The sim core must not import render/ui/audio/input/storage layers.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'The sim must be headless: no window.' },
        { name: 'document', message: 'The sim must be headless: no document.' },
        { name: 'performance', message: 'The sim must be deterministic: use state.tick, not wall-clock.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'The sim must use the seeded PRNG (src/sim/rng.ts), not Math.random().' },
        { object: 'Date', property: 'now', message: 'The sim must be deterministic: no Date.now().' },
      ],
    },
  },
  {
    files: ['relay/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        clearInterval: 'readonly',
        console: 'readonly',
        process: 'readonly',
        setInterval: 'readonly',
        URL: 'readonly',
      },
    },
  },
];
