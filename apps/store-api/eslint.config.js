import nestConfig from '@store/eslint-config/nest';
import tseslint from 'typescript-eslint';

export default [
  ...nestConfig,
  {
    languageOptions: {
      parser: tseslint.parser,
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },
];