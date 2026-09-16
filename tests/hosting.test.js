import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { configureHostedFrontend, backendOrigin, checkHostedBackend } from '../scripts/hosting-config.js';

test('hosted login requires a public backend and exports no secrets', async () => {
  for (const value of ['http://localhost:4173', 'https://user:pass@backend.test', 'https://backend.test/path', 'https://backend.test/?key=secret', 'https://*.example.test', 'not a url']) {
    assert.throws(() => backendOrigin(value), /RAILGO_BACKEND_URL/);
  }
  await mkdir('test-results', { recursive: true });
  const output = pathToFileURL(path.resolve(await mkdtemp('test-results/hosting-')) + path.sep);
  await assert.rejects(configureHostedFrontend(output, { RAILGO_REQUIRE_EMAIL_LOGIN: 'true' }), /requires RAILGO_BACKEND_URL/);
  for (const VERCEL_ENV of ['production', 'preview']) {
    await assert.rejects(configureHostedFrontend(output, { VERCEL_ENV, RAILGO_REQUIRE_EMAIL_LOGIN: 'false' }), /requires RAILGO_BACKEND_URL/);
  }
  await configureHostedFrontend(output, { RAILGO_BACKEND_URL: ' https://backend.example.test/ ', RESEND_API_KEY: 'test-only', SMTP_PASS: 'test-only', SMTP_USER: 'private-sender@example.test', EMAIL_FROM: 'private-sender@example.test', SESSION_SECRET: 'test-only', DATABASE_URL: 'file:/private/data.db' });
  const config = await readFile(new URL('config.js', output), 'utf8');
  assert.match(config, /"apiBase":"https:\/\/backend.example.test"/);
  assert.equal(config.includes('RESEND_API_KEY'), false);
  assert.equal(config.includes('test-only'), false);
  for (const forbidden of ['SMTP', 'SESSION_SECRET', 'DATABASE_URL', 'private-sender', '/private/']) assert.equal(config.includes(forbidden), false);
  const context = { window: {} }; vm.runInNewContext(config, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.LIVE_TRAIN_CONFIG)), { apiBase: 'https://backend.example.test' });
  await configureHostedFrontend(output, {});
  const standalone = await readFile(new URL('config.js', output), 'utf8');
  vm.runInNewContext(standalone, context);
  assert.equal(context.window.LIVE_TRAIN_CONFIG.apiBase, '', 'An unset build URL clears stale copied configuration');
});

test('deployment gates check the real backend and the frontend origins before publishing', async () => {
  const calls = [], verify = async (...args) => { calls.push(args); };
  await checkHostedBackend({}, verify);
  assert.equal(calls.length, 0, 'Offline static previews remain possible');
  await assert.rejects(checkHostedBackend({ VERCEL_ENV: 'production' }, verify), /requires RAILGO_BACKEND_URL/);
  await checkHostedBackend({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'site.vercel.app', RAILGO_BACKEND_URL: 'https://backend.example.test' }, verify);
  await checkHostedBackend({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY_OWNER: 'Owner', RAILGO_REQUIRE_EMAIL_LOGIN: 'true', RAILGO_BACKEND_URL: 'https://backend.example.test', RAILGO_FRONTEND_ORIGINS: 'https://custom.example.test' }, verify);
  assert.deepEqual(calls, [
    ['https://backend.example.test', ['https://site.vercel.app']],
    ['https://backend.example.test', ['https://custom.example.test', 'https://owner.github.io']],
  ]);
  await assert.rejects(checkHostedBackend({ VERCEL_ENV: 'preview', RAILGO_BACKEND_URL: 'https://backend.example.test' }, async () => { throw new Error('Backend did not set a session cookie.'); }), /session cookie/);
});
