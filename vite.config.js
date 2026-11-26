import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      input: path.resolve(__dirname, 'vite.html'),
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'v';
        },
        entryFileNames: 'assets/c-[hash].js',
        chunkFileNames: 'assets/v-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5050',
    },
  },
});
