import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

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

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...fsdBoundaryRules,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;