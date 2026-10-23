import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds dist/scene-tuner.html — the whole editor in one file that opens
// offline by double-clicking it.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist/editor-tmp',
    emptyOutDir: true,
    target: 'es2020',
  },
});
