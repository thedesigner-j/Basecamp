// Moves the single-file editor build to dist/scene-tuner.html.
import { renameSync, rmSync } from 'node:fs';
renameSync('dist/editor-tmp/index.html', 'dist/scene-tuner.html');
rmSync('dist/editor-tmp', { recursive: true, force: true });
console.log('wrote dist/scene-tuner.html');
