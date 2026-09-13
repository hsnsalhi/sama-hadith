import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { resolve } from 'path';

export default defineConfig({
  // Sub-path when hosted on GitHub Pages (e.g. /sama-hadith/), "/" elsewhere
  base: process.env.VITE_BASE || '/',
  plugins: [glsl()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        narrator: resolve(__dirname, 'narrator.html'),
        stats: resolve(__dirname, 'stats.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
