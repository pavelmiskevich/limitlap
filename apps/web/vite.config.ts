import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths: the same build works locally and under /limitlap/ on GitHub Pages.
  base: './',
  // Three.js alone is about 520 kB (130 kB gzipped); the load budget is tracked separately.
  build: { target: 'es2022', chunkSizeWarningLimit: 700 },
});
