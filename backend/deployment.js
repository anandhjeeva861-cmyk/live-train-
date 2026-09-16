import path from 'node:path';
import { emailSetupIssues } from './email.js';

export function allowedOrigin(value, production = false) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Origins must be complete HTTP(S) origins, without paths or wildcards.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.hostname.includes('*') || (production && !local && url.protocol !== 'https:')) {
    throw new Error('Origins must use HTTPS (HTTP is allowed for localhost), without credentials, paths, queries or wildcards.');
  }
  return url.origin;
}

export function serverOrigins(env = process.env) {
  const production = env.NODE_ENV === 'production', port = Number(env.PORT) || 4173;
  const values = [env.FRONTEND_URL, env.RENDER_EXTERNAL_URL,
    'http://localhost:4173', 'http://127.0.0.1:4173', 'http://localhost:4174', 'http://127.0.0.1:4174',
    ...(!production ? [`http://localhost:${port}`, `http://127.0.0.1:${port}`] : []),
    ...(env.ALLOWED_ORIGINS || '').split(',')].filter(value => value?.trim());
  return new Set(values.map(value => allowedOrigin(value, production)));
}

export function sessionCookieOptions(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const sameSite = env.SESSION_SAME_SITE || (production ? 'none' : 'lax');
  if (!['lax', 'strict', 'none'].includes(sameSite) || (!production && sameSite === 'none')) throw new Error('Use SESSION_SAME_SITE=none only with production HTTPS; local HTTP uses lax.');
  return { httpOnly: true, secure: production, sameSite, maxAge: 7 * 86400000 };
}

export function validateProduction(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  if (!(env.SESSION_SECRET?.length >= 32)) throw new Error('Production requires a strong SESSION_SECRET of at least 32 characters.');
  const dbPath = env.DATABASE_URL?.startsWith('file:') ? env.DATABASE_URL.slice(5) : '';
  if (!dbPath || !path.isAbsolute(dbPath)) throw new Error('Production requires DATABASE_URL=file:/absolute/path/on/persistent/disk.db.');
  const backend = env.FRONTEND_URL || env.RENDER_EXTERNAL_URL;
  if (!backend || !allowedOrigin(backend, true).startsWith('https://')) throw new Error('Set FRONTEND_URL to the backend HTTPS origin, or use Render RENDER_EXTERNAL_URL.');
  serverOrigins(env); sessionCookieOptions(env);
  const missing = emailSetupIssues(env);
  if (missing.length) throw new Error('Production email setup is incomplete: ' + missing.join(', ') + '. Configure these privately on the backend.');
}
