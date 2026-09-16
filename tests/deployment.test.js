import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { allowedOrigin, serverOrigins, sessionCookieOptions, validateProduction } from '../backend/deployment.js';

test('production origins accept the two exact sites and localhost, without wildcard access', () => {
  const env = { NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://live-train-api.onrender.com', ALLOWED_ORIGINS: ' https://live-train-five.vercel.app/, https://anandhjeeva861-cmyk.github.io ' };
  const origins = serverOrigins(env);
  for (const value of ['https://live-train-api.onrender.com', 'https://live-train-five.vercel.app', 'https://anandhjeeva861-cmyk.github.io', 'http://localhost:4174', 'http://127.0.0.1:4174']) assert.ok(origins.has(value));
  assert.equal(origins.has('https://untrusted.vercel.app'), false);
  for (const value of ['*', 'https://*.vercel.app', 'https://anandhjeeva861-cmyk.github.io/live-train-/', 'http://public.example', 'https://user:password@public.example', 'https://public.example/?secret=bad', 'null']) assert.throws(() => allowedOrigin(value, true));
});

test('production uses secure cross-site cookies while local HTTP remains unchanged', () => {
  assert.deepEqual(sessionCookieOptions({ NODE_ENV: 'production' }), { httpOnly: true, secure: true, sameSite: 'none', maxAge: 604800000 });
  assert.equal(sessionCookieOptions({}).sameSite, 'lax');
  assert.equal(sessionCookieOptions({}).secure, false);
  assert.throws(() => sessionCookieOptions({ SESSION_SAME_SITE: 'none' }));
});

test('production refuses missing persistence, sender configuration or signing secrets', () => {
  const env = { NODE_ENV: 'production', SESSION_SECRET: crypto.randomBytes(48).toString('hex'), DATABASE_URL: 'file:' + path.resolve('test-results/production.db'), RENDER_EXTERNAL_URL: 'https://live-train-api.onrender.com', EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'sender@gmail.com', SMTP_PASS: 'test-only', EMAIL_FROM: 'Live Train <sender@gmail.com>' };
  assert.doesNotThrow(() => validateProduction(env));
  for (const overrides of [{ SESSION_SECRET: '' }, { DATABASE_URL: 'file:./ephemeral.db' }, { SMTP_PASS: '' }, { RENDER_EXTERNAL_URL: '' }, { ALLOWED_ORIGINS: '*' }]) assert.throws(() => validateProduction({ ...env, ...overrides }));
});
