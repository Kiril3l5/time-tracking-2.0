import { defineConfig, loadEnv, type ConfigEnv, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }: ConfigEnv): UserConfig => {
  const rootDir = path.resolve(__dirname, '../..');
  
  // Load env file based on `mode` from both the current dir and the root dir
  // This ensures we find .env files in the project root
  const env = {
    ...loadEnv(mode, process.cwd(), ''),
    ...loadEnv(mode, rootDir, '')
  };
  
  return {
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
    ] as any,
    define: {
      // Make all environment variables available to the client
      // This avoids the "Missing Firebase configuration" error
      'import.meta.env.DEV': JSON.stringify(process.env.NODE_ENV !== 'production'),
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(env.VITE_FIREBASE_API_KEY),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(env.VITE_FIREBASE_PROJECT_ID),
      'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(env.VITE_FIREBASE_STORAGE_BUCKET),
      'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(env.VITE_FIREBASE_APP_ID),
      'import.meta.env.VITE_FIREBASE_MEASUREMENT_ID': JSON.stringify(env.VITE_FIREBASE_MEASUREMENT_ID),
      'import.meta.env.VITE_USE_FIREBASE_EMULATOR': JSON.stringify(env.VITE_USE_FIREBASE_EMULATOR),
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
      chunkSizeWarningLimit: 600,
      commonjsOptions: {
        include: [/node_modules/],
        transformMixedEsModules: true,
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-router': ['react-router-dom'],
            'vendor-firebase-core': ['firebase/app', 'firebase/auth'],
            'vendor-firebase-firestore': ['firebase/firestore'],
            'vendor-state': ['zustand', 'immer'],
          }
        }
      }
    },
  };
});