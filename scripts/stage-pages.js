import { cp, writeFile } from 'node:fs/promises';
import './build-pages.js';
import { configureHostedFrontend, checkHostedBackend } from './hosting-config.js';
import { prepareOutput } from './build-output.js';

// Publish only browser assets; no backend, environment, database or test files.
await checkHostedBackend();
const root = new URL('../', import.meta.url);
const output = await prepareOutput('pages');
await cp(new URL('public/', root), new URL('public/', output), { recursive: true });
await configureHostedFrontend(new URL('public/', output));
await cp(new URL('index.html', root), new URL('index.html', output));
await writeFile(new URL('.nojekyll', output), '');
console.log('GitHub Pages artifact prepared at dist/pages.');
