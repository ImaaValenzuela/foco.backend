import js from '@eslint/js';

export default [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        require: 'readonly', module: 'readonly', process: 'readonly', console: 'readonly',
      },
    },
    rules: { 'no-console': 'off', 'no-unused-vars': 'warn' },
  },
];
