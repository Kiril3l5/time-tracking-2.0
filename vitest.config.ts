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
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
    css: false, // Ignore CSS imports during testing
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage'
    },
    deps: {
      // Fix for the n.endsWith issue - use string arrays instead of RegExp
      optimizer: {
        web: {
          include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime']
        }
      }
    }
  },
  resolve: {
    alias: {
      '@common': path.resolve(__dirname, 'packages/common/src'),
      '@admin': path.resolve(__dirname, 'packages/admin/src'),
      '@hours': path.resolve(__dirname, 'packages/hours/src'),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js'),
      // Add additional React aliases for better resolution
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom')
    }
  }
});
