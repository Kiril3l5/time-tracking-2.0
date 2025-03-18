import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'public/_redirects',
          dest: '',
        },
      ],
    }),
  ],
  define: {
    'import.meta.env.DEV': JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@common': path.resolve(__dirname, '../common/src'),
    },
    // Force module to be resolved as ESM
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
  optimizeDeps: {
    include: [
      'immer',
      'zustand',
      'zustand/middleware',
      'zustand/middleware/immer',
      '@common',
    ],
    esbuildOptions: {
      resolveExtensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
  },
});