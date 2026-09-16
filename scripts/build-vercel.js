import { cp, readFile, writeFile } from 'node:fs/promises';
import { configureHostedFrontend, checkHostedBackend } from './hosting-config.js';
import { prepareOutput } from './build-output.js';
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('public/index.html', root), 'utf8');
if (!source.includes('<html lang="en">') || !source.includes('<head>')) {
  throw new Error('Cannot prepare Vercel entry: expected HTML markers are missing.');
}
await checkHostedBackend();
const output = await prepareOutput('vercel');
await cp(new URL('public/', root), output, { recursive: true });
await configureHostedFrontend(output);
await writeFile(new URL('index.html', output), source.replace('<html lang="en">', '<html lang="en" data-hosting="static">').replace('<head>', '<head>\n  <base href="/">'));
console.log('Vercel static frontend prepared at dist/vercel.');
