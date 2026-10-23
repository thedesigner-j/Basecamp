import { defineConfig } from 'vite';

// Builds dist/scene-reveal.min.js — the single file your website loads.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/runtime/embed.js',
      name: 'SceneRevealBundle',
      formats: ['iife'],
      fileName: () => 'scene-reveal.min.js',
    },
    minify: 'esbuild',
    target: 'es2019',
  },
});
