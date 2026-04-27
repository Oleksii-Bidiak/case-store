import baseConfig from './index.js';

export default [
  ...baseConfig,
  {
    rules: {
      'no-console': 'off', // NestJS logger uses console
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];