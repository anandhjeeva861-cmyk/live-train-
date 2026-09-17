import { cp, readFile, writeFile } from 'node:fs/promises';
import { prepareOutput } from './build-output.js';
import { runCloudPrisma } from './cloud-prisma.js';
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('public/index.html', root), 'utf8');
if (!source.includes('<html lang="en">') || !source.includes('<head>')) {
  throw new Error('Cannot prepare Vercel entry: expected HTML markers are missing.');
}
await runCloudPrisma('generate');
if (/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL || '')) await runCloudPrisma('migrate');
else console.warn('Add the Neon DATABASE_URL and email settings in Vercel, then redeploy to enable OTP.');
const output = await prepareOutput('vercel');
await cp(new URL('public/', root), output, { recursive: true });
await writeFile(new URL('config.js', output), 'window.LIVE_TRAIN_CONFIG = { apiBase: "", catalogueStatic: true };\n');
await writeFile(new URL('index.html', output), source.replace('<head>', '<head>\n  <base href="/">'));
console.log('Vercel frontend and same-origin OTP API prepared.');
