'use strict';

const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const homeyApp = require('eslint-plugin-homey-app');
const nodePlugin = require('eslint-plugin-n');

module.exports = tseslint.config(
  {
    ignores: [
      '.homeybuild/**',
      'node_modules/**',
      'coverage/**',
      'app.json',
      'eslint.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  homeyApp.configs.recommended,
  nodePlugin.configs['flat/recommended'],
  {
    files: ['**/*.{js,cjs,mjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
      },
    },
    settings: {
      n: {
        allowModules: ['homey'],
        tryExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.node'],
      },
    },
    rules: {
      'max-len': ['warn', 200],
      'no-await-in-loop': 'off',
      'no-bitwise': 'off',
      'no-continue': 'off',
      'no-param-reassign': 'off',
      'no-plusplus': 'off',
      'no-underscore-dangle': 'off',
      'class-methods-use-this': 'off',
      'padded-blocks': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'n/no-missing-import': ['error', { allowModules: ['homey'] }],
      'n/no-missing-require': ['error', { allowModules: ['homey'] }],
      'n/no-unpublished-require': ['error', { allowModules: ['homey'] }],
      'n/no-unpublished-import': ['error', { allowModules: ['homey'] }],
      'n/no-unsupported-features/es-syntax': [
        'error',
        { ignores: ['modules'] },
      ],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }],
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { vars: 'all', args: 'none', ignoreRestSiblings: true },
      ],
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'n/no-unsupported-features/es-syntax': 'off',
      // TypeScript resolves .js specifiers to .ts sources; leave that to tsc.
      'n/no-missing-import': 'off',
    },
  },
  {
    files: [
      '**/*.test.ts',
      '**/*.test.js',
      '**/__mocks__/**',
      '**/__tests__/**',
      'jest.config.ts',
      'jest.config.js',
    ],
    rules: {
      'n/no-unpublished-require': 'off',
      'n/no-unpublished-import': 'off',
    },
  },
);
