import { cp, mkdir, writeFile } from 'node:fs/promises';
import './build-pages.js';
import { configureHostedFrontend } from './hosting-config.js';

// Publish only browser assets; no backend, environment, database or test files.
await mkdir('dist/pages', { recursive: true });
await cp('public', 'dist/pages/public', { recursive: true });
await configureHostedFrontend(new URL('../dist/pages/public/', import.meta.url));
await cp('index.html', 'dist/pages/index.html');
await writeFile('dist/pages/.nojekyll', '');
console.log('GitHub Pages artifact prepared at dist/pages.');
