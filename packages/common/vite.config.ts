import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import dts from 'vite-plugin-dts';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
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
      dts({
        entryRoot: 'src',
        tsconfigPath: 'tsconfig.json',
      }),
    ],
    build: {
      lib: {
        entry: 'src/index.ts',
        formats: ['es'],
        fileName: () => 'index.js',
      },
      rollupOptions: {
        external: ['react', 'react-dom', 'react/jsx-runtime'],
      },
    },
    define: {
      // Make all environment variables available to the client
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
  };
}); 