import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';
   import { resolve } from 'path';
   import { viteStaticCopy } from 'vite-plugin-static-copy';

   export default defineConfig({
     plugins: [
       react(),
       viteStaticCopy({
         targets: [
           {
             src: '../../CNAME',
             dest: './'
           }
         ]
       })
     ],
     resolve: {
       alias: {
         '@': resolve(__dirname, 'src'),
         '@common': resolve(__dirname, '../common/src')
       }
     },
     build: {
       outDir: 'dist',
       emptyOutDir: true
     },
     server: {
       port: 3000
     }
   });