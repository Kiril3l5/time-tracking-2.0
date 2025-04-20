/// <reference types="vitest" />
// @ts-nocheck - Ignore type issues temporarily while we fix compatibility
import { defineConfig } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';
import fs from 'fs';

// Dynamically check if the JSX runtime files exist
const reactDir = path.resolve(__dirname, 'node_modules/react');
const jsxRuntimeExists = fs.existsSync(path.join(reactDir, 'jsx-runtime.js'));
const jsxDevRuntimeExists = fs.existsSync(path.join(reactDir, 'jsx-dev-runtime.js'));

// If jsx-runtime.js doesn't exist but jsx-dev-runtime.js does, copy it
if (!jsxRuntimeExists && jsxDevRuntimeExists) {
  try {
    console.log('Creating jsx-runtime.js from jsx-dev-runtime.js...');
    fs.copyFileSync(
      path.join(reactDir, 'jsx-dev-runtime.js'),
      path.join(reactDir, 'jsx-runtime.js')
    );
    // Also copy the .js.map if it exists
    const jsxDevRuntimeMapPath = path.join(reactDir, 'jsx-dev-runtime.js.map');
    const jsxRuntimeMapPath = path.join(reactDir, 'jsx-runtime.js.map');
    if (fs.existsSync(jsxDevRuntimeMapPath)) {
      fs.copyFileSync(jsxDevRuntimeMapPath, jsxRuntimeMapPath);
    }
  } catch (error) {
    console.warn('Failed to create jsx-runtime.js:', error.message);
  }
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    include: [
      'packages/*/src/**/*.test.{ts,tsx}',
      'packages/*/src/**/*.spec.{ts,tsx}',
      'scripts/**/*.test.{ts,js}',
      'scripts/**/*.spec.{ts,js}'
    ],
    css: false, // Ignore CSS imports during testing
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'packages/*/src/**/*.{ts,tsx,js,jsx}',
        'scripts/**/*.{ts,js}'
      ],
      exclude: [
        // Exclude test files themselves
        '**/*.test.{ts,tsx,js,jsx}',
        '**/*.spec.{ts,tsx,js,jsx}',
        // Exclude config/setup files
        '**/vitest.setup.ts',
        '**/vitest.config.ts',
        '**/*.config.{js,ts}',
        '**/postcss.config.js',
        '**/tailwind.config.js',
        // Exclude main entry points if not testable
        '**/main.{ts,tsx}',
        // Exclude type definition files
        '**/*.d.ts',
        // Exclude storybook files
        '**/*.stories.{ts,tsx}',
        // Add any other specific files/directories to exclude
        'packages/common/src/stories/**',
        'packages/common/src/firebase/index.ts',
        'packages/common/src/hooks/index.ts',
        'packages/common/src/store/index.ts',
        'packages/common/src/types/index.ts',
        'packages/common/src/components/ui/icons/index.tsx',
        'packages/common/src/components/forms/index.ts'
      ],
      all: true, // Include all files, even those not tested
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
      skipFull: false, // Don't skip files with 100% coverage
      watermarks: {
        lines: [80, 95],
        functions: [80, 95],
        branches: [80, 95],
        statements: [80, 95]
      }
    },
    deps: {
      optimizer: {
        web: {
          include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime']
        }
      }
    },
    outputFile: {
      json: './temp/vitest-results.json'
    }
  },
  resolve: {
    alias: {
      '@common': path.resolve(__dirname, 'packages/common/src'),
      '@admin': path.resolve(__dirname, 'packages/admin/src'),
      '@hours': path.resolve(__dirname, 'packages/hours/src'),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js'),
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom')
    }
  }
});
