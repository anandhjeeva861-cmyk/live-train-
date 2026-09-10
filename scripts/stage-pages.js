import { cp, mkdir, writeFile } from 'node:fs/promises';
import './build-pages.js';

// Publish only browser assets; no backend, environment, database or test files.
await mkdir('dist/pages', { recursive: true });
await cp('public', 'dist/pages/public', { recursive: true });
await cp('index.html', 'dist/pages/index.html');
await writeFile('dist/pages/.nojekyll', '');
console.log('GitHub Pages artifact prepared at dist/pages.');
