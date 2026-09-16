import { mkdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function prepareOutput(name) {
  if (!['pages', 'vercel'].includes(name)) throw new Error('Unknown frontend build target.');
  const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
  const dist = path.join(root, 'dist');
  await mkdir(dist, { recursive: true });
  if (await realpath(dist) !== dist) throw new Error('Build output must stay inside the project dist directory.');
  const target = path.resolve(dist, name);
  if (path.dirname(target) !== dist) throw new Error('Invalid build output path.');
  // Clear generated assets so removed source files cannot survive another build.
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  return pathToFileURL(target + path.sep);
}
