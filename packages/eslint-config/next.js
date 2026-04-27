import baseConfig from './index.js';

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        JSX: 'readonly',
        React: 'readonly',
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];