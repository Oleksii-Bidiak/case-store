import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tailwindcss from 'eslint-plugin-tailwindcss';

/**
 * FSD (Feature-Sliced Design) layer boundary rules.
 *
 * Import direction is strictly downward:
 *   app → widgets → features → entities → shared
 *
 * Each layer may only import from layers below it, never above.
 * These rules enforce path-alias imports (e.g. @/entities/...).
 * Relative cross-layer imports are discouraged by convention and
 * caught in code review.
 */
const fsdBoundaryRules = [
  // shared — cannot import from any other layer
  {
    name: 'fsd-shared-boundaries',
    files: ['src/shared/**/*.{ts,tsx,js,jsx,mjs,mts,cts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/**', '@/widgets/**', '@/features/**', '@/entities/**'],
              message:
                'FSD boundary violation: "shared" layer must not import from "app", "widgets", "features", or "entities" layers. Use @/shared/ instead.',
            },
          ],
        },
      ],
    },
  },
  // entities — can only import from shared
  {
    name: 'fsd-entities-boundaries',
    files: ['src/entities/**/*.{ts,tsx,js,jsx,mjs,mts,cts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/**', '@/widgets/**', '@/features/**'],
              message:
                'FSD boundary violation: "entities" layer must not import from "app", "widgets", or "features" layers. Only @/shared/ and @/entities/ imports are allowed.',
            },
          ],
        },
      ],
    },
  },
  // features — can import from entities and shared only
  {
    name: 'fsd-features-boundaries',
    files: ['src/features/**/*.{ts,tsx,js,jsx,mjs,mts,cts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/**', '@/widgets/**'],
              message:
                'FSD boundary violation: "features" layer must not import from "app" or "widgets" layers. Only @/shared/, @/entities/, and @/features/ imports are allowed.',
            },
          ],
        },
      ],
    },
  },
  // widgets — can import from features, entities, and shared only
  {
    name: 'fsd-widgets-boundaries',
    files: ['src/widgets/**/*.{ts,tsx,js,jsx,mjs,mts,cts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/**'],
              message:
                'FSD boundary violation: "widgets" layer must not import from "app" layer. Only @/shared/, @/entities/, and @/features/ imports are allowed.',
            },
          ],
        },
      ],
    },
  },
];

/**
 * Test infrastructure is cross-cutting: a component test renders a widget/feature
 * while wiring providers from the shared test helper, and that helper composes the
 * AuthContext from the entities layer. Exempt test files and `shared/test/` from
 * the FSD import-direction rule (it still applies to all production code).
 */
const testOverrides = [
  {
    name: 'fsd-test-exemptions',
    files: ['src/**/*.test.{ts,tsx}', 'src/shared/test/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];

/**
 * Design-token guard (TASK-260): forbid Tailwind arbitrary values like
 * `text-[13.5px]` / `w-[137px]` — new code must use the design-token scale
 * (or add a proper `@theme` token in globals.css). Pre-existing violations
 * are grandfathered in `eslint-suppressions.json`; structurally necessary
 * cases carry an inline eslint-disable comment with a reason.
 * Only `no-arbitrary-value` is enabled — not the plugin's full preset.
 */
const tailwindTokenGuard = [
  {
    name: 'tailwind-no-arbitrary-value',
    plugins: { tailwindcss },
    settings: {
      tailwindcss: {
        cssConfigPath: './src/app/globals.css',
      },
    },
    rules: {
      'tailwindcss/no-arbitrary-value': 'error',
    },
  },
];

/**
 * Raw-`fetch` guard (TASK-327).
 *
 * A build-time `fetch` without a deadline is not a style problem — it is a
 * build-breaker. `fetch` has no default timeout, so an API that accepts the TCP
 * connection and then goes silent (half-started container, paused VPS, API
 * booting in parallel in CI) hangs the request forever. The root layout fetches
 * SEO settings, so that hang propagates to every prerendered page: each one
 * burns `staticPageGenerationTimeout`, is retried 3 times, and `next build` dies
 * with `Failed to build /<page> after 3 attempts`. TASK-327 fixed 13 such call
 * sites at once; this rule is what stops the 14th from being written.
 *
 * Scope: ALL of `src/**`, not just server files. That is deliberate rather than
 * lazy — the storefront has no legitimate raw `fetch` anywhere:
 *   - server code must use `serverFetch`, which attaches the deadline;
 *   - browser code must use the Orval-generated hooks (AGENTS.md §API Contract:
 *     "never write manual fetch/axios calls"), which carry auth refresh, the
 *     response envelope and React Query caching.
 * So one rule enforces both existing project rules, and there is no
 * server/client heuristic (`'use client'`, file path) that could get it wrong.
 * If a genuinely browser-only `fetch` is ever needed, narrow this by adding a
 * `files`-scoped override — do not weaken the selector.
 *
 * Exceptions: `shared/api/server-fetch.ts` (the wrapper itself) and
 * `shared/api/generated/**` (Orval output, never hand-edited).
 */
const rawFetchGuard = [
  {
    name: 'no-raw-fetch',
    files: ['src/**/*.{ts,tsx,js,jsx,mjs,mts,cts}'],
    ignores: ['src/shared/api/server-fetch.ts', 'src/shared/api/generated/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            'Заборонений «голий» fetch: він не має таймауту за замовчуванням, тому мовчазний API вішає збірку (кожна сторінка вигорає staticPageGenerationTimeout, Next ретраїть її 3 рази і build падає з «Failed to build … after 3 attempts»). На сервері використовуй serverFetch з @/shared/api/server-fetch (він завжди накладає AbortSignal.timeout). У браузері — згенеровані Orval-хуки, а не ручний fetch.',
        },
        {
          selector:
            "CallExpression[callee.object.name=/^(globalThis|global|window|self)$/][callee.property.name='fetch']",
          message:
            'Заборонений «голий» fetch (через globalThis/window/global/self) — обхід того самого правила. На сервері використовуй serverFetch з @/shared/api/server-fetch, у браузері — згенеровані Orval-хуки.',
        },
      ],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...fsdBoundaryRules,
  ...testOverrides,
  ...tailwindTokenGuard,
  ...rawFetchGuard,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // CommonJS test tooling (must use require; runs outside the app bundle).
    'jest.polyfills.js',
  ]),
]);

export default eslintConfig;