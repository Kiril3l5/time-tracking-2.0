/// <reference types="vitest" />
// @ts-nocheck - Ignore type issues temporarily while we fix compatibility
import { defineConfig } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';

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
      inline: ['react', 'react-dom']
    }
  },
  resolve: {
    alias: {
      '@common': path.resolve(__dirname, 'packages/common/src'),
      '@admin': path.resolve(__dirname, 'packages/admin/src'),
      '@hours': path.resolve(__dirname, 'packages/hours/src'),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js')
    }
  }
});
