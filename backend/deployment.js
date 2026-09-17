import path from 'node:path';
import { emailSetupIssues } from './email.js';
import { allowedOrigin } from './origins.js';
export { allowedOrigin } from './origins.js';

export function cloudSetupIssues(env = process.env) {
  const issues = [];
  let database;
  try { database = new URL(env.DATABASE_URL); } catch { /* reported below */ }
  if (!database || !['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || !database.pathname.slice(1)) issues.push('DATABASE_URL (Neon PostgreSQL connection string)');
  if (!(env.SESSION_SECRET?.length >= 32)) issues.push('SESSION_SECRET (at least 32 characters)');
  issues.push(...emailSetupIssues(env));
  return issues;
}

export function serverOrigins(env = process.env) {
  const production = env.NODE_ENV === 'production', port = Number(env.PORT) || 4173;
  const values = [env.FRONTEND_URL, env.RENDER_EXTERNAL_URL,
    ...(env.VERCEL === '1' ? [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(host => `https://${host}`) : []),
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
  const cloud = /^postgres(?:ql)?:\/\//.test(env.DATABASE_URL || '');
  if (env.VERCEL === '1' && !cloud) throw new Error('Vercel requires a PostgreSQL DATABASE_URL; local SQLite cannot persist in a function.');
  if (cloud) {
    const issues = cloudSetupIssues(env);
    if (issues.length) throw new Error('Cloud backend setup is incomplete: ' + issues.join(', '));
  } else if (!dbPath || !path.isAbsolute(dbPath)) throw new Error('Production requires DATABASE_URL=file:/absolute/path/on/persistent/disk.db or a PostgreSQL connection string.');
  const backend = env.FRONTEND_URL || env.RENDER_EXTERNAL_URL || (env.VERCEL === '1' && env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  if (!backend || !allowedOrigin(backend, true).startsWith('https://')) throw new Error('Set FRONTEND_URL to the backend HTTPS origin, or use Render RENDER_EXTERNAL_URL.');
  serverOrigins(env); sessionCookieOptions(env);
  const missing = emailSetupIssues(env);
  if (missing.length) throw new Error('Production email setup is incomplete: ' + missing.join(', ') + '. Configure these privately on the backend.');
}
