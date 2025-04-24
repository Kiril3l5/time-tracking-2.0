// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'lib/**', // Ignore compiled JS output
      'generated/**',
      'eslint.config.js', // Ignore self
    ],
  },

  // Base recommended rules
  eslint.configs.recommended,

  // TypeScript specific configurations
  ...tseslint.configs.recommended, // Apply recommended TS rules

  // Custom configuration for TypeScript files
  {
    files: ['**/*.ts'], // Target only TS files
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        ...globals.node, // Use Node.js globals
        ...globals.es2021,
      },
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.dev.json'],
        tsconfigRootDir: import.meta.dirname, // Use directory of this config file as root
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      // 'import': pluginImport, // If needed, install eslint-plugin-import and configure
    },
    rules: {
      // --- General Rules ---
      'quotes': ['error', 'double'],
      // 'import/no-unresolved': 0, // Configure if using eslint-plugin-import
      'indent': ['error', 2],
      'require-jsdoc': 'off', // Often too verbose for functions
      'valid-jsdoc': 'off', // Often too verbose for functions
      'object-curly-spacing': ['error', 'always'],
      'max-len': ['warn', { code: 120 }], // Warn on long lines

      // --- Allow Console ---
      'no-console': 'off',

      // --- TypeScript Specific Adjustments ---
      '@typescript-eslint/no-explicit-any': 'warn', // Warn instead of error for 'any'
      '@typescript-eslint/no-var-requires': 'warn', // Warn instead of error for require()
      '@typescript-eslint/no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }], // Warn on unused vars

      // --- Turn off rules handled better by TypeScript ---
      'no-undef': 'off', // TypeScript handles undefined variables better
    },
  }
); 