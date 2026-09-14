import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

export function backendOrigin(value) {
  if (!value?.trim()) return '';
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('RAILGO_BACKEND_URL must be a public HTTPS origin.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname)) {
    throw new Error('RAILGO_BACKEND_URL must be a public HTTPS origin without credentials, paths or query parameters.');
  }
  return url.origin;
}

export async function configureHostedFrontend(directory, env = process.env) {
  const apiBase = backendOrigin(env.RAILGO_BACKEND_URL);
  if (env.RAILGO_REQUIRE_EMAIL_LOGIN === 'true' && !apiBase) {
    throw new Error('Email login deployment requires RAILGO_BACKEND_URL. Set it to your running backend HTTPS origin.');
  }
  if (apiBase) {
    await writeFile(new URL('config.js', directory), `// Generated public backend origin. No credentials belong in this file.\nwindow.LIVE_TRAIN_CONFIG = ${JSON.stringify({ apiBase })};\n`);
    console.log('Hosted frontend will open the configured backend for email login.');
  } else {
    console.warn('RAILGO_BACKEND_URL is unset: static preview only. Email delivery requires a configured backend.');
  }
}
