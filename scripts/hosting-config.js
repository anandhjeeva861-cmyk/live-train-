import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyBackend } from './verify-backend.js';

try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

export function backendOrigin(value) {
  if (!value?.trim()) return '';
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('RAILGO_BACKEND_URL must be a public HTTPS origin.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.hostname.includes('*') || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname)) {
    throw new Error('RAILGO_BACKEND_URL must be a public HTTPS origin without credentials, paths or query parameters.');
  }
  return url.origin;
}

export async function checkHostedBackend(env = process.env, verify = verifyBackend) {
  const required = ['production', 'preview'].includes(env.VERCEL_ENV) || env.RAILGO_REQUIRE_EMAIL_LOGIN === 'true';
  if (!required) return;
  const backend = backendOrigin(env.RAILGO_BACKEND_URL);
  if (!backend) throw new Error('Email login deployment requires RAILGO_BACKEND_URL. Deploy the persistent Node backend first; see DEPLOYMENT.md.');
  const origins = (env.RAILGO_FRONTEND_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (env.GITHUB_ACTIONS === 'true' && env.GITHUB_REPOSITORY_OWNER) origins.push(`https://${env.GITHUB_REPOSITORY_OWNER.toLowerCase()}.github.io`);
  const vercelHost = env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_URL;
  if (vercelHost) origins.push(`https://${vercelHost}`);
  await verify(backend, [...new Set(origins)]);
  console.log('Hosted backend health, email settings and session checks passed. No OTP was sent.');
}

export async function configureHostedFrontend(directory, env = process.env) {
  const apiBase = backendOrigin(env.RAILGO_BACKEND_URL);
  const hostedDeployment = ['production', 'preview'].includes(env.VERCEL_ENV);
  if ((hostedDeployment || env.RAILGO_REQUIRE_EMAIL_LOGIN === 'true') && !apiBase) {
    throw new Error('Email login deployment requires RAILGO_BACKEND_URL. Set it to your running backend HTTPS origin.');
  }
  // Always overwrite copied config to prevent an old deployment URL or any
  // unrelated environment value from carrying into a new build.
  await writeFile(new URL('config.js', directory), `// Generated public backend origin. No credentials belong in this file.\nwindow.LIVE_TRAIN_CONFIG = ${JSON.stringify({ apiBase })};\n`);
  if (apiBase) {
    console.log('Hosted frontend API calls will use the configured HTTPS backend.');
  } else {
    console.warn('RAILGO_BACKEND_URL is unset: static preview only. Email delivery requires a configured backend.');
  }
}
