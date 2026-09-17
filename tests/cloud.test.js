import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readEmailCode, testProfile } from './helpers.js';
import { cloudSetupIssues, serverOrigins, validateProduction } from '../backend/deployment.js';

test('Vercel configuration requires cloud persistence and recognizes its own origins', () => {
  const env = { NODE_ENV: 'production', VERCEL: '1', VERCEL_URL: 'preview.example.com', VERCEL_PROJECT_PRODUCTION_URL: 'app.example.com',
    DATABASE_URL: 'postgresql://localhost/railgo', SESSION_SECRET: crypto.randomBytes(48).toString('hex'), EMAIL_PROVIDER: 'smtp',
    SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'sender@example.test', SMTP_PASS: crypto.randomBytes(16).toString('hex'), EMAIL_FROM: 'sender@example.test' };
  assert.deepEqual(cloudSetupIssues(env), []);
  assert.doesNotThrow(() => validateProduction(env));
  assert.ok(serverOrigins(env).has('https://app.example.com'));
  assert.ok(serverOrigins(env).has('https://preview.example.com'));
  assert.throws(() => validateProduction({ ...env, DATABASE_URL: 'file:/tmp/app.db' }), /PostgreSQL/);
});

test('PostgreSQL OTP, sessions and rate limits persist between function processes', { timeout: 120000 }, async t => {
  const db = await PGlite.create();
  await db.exec(readFileSync(new URL('../prisma/cloud/migrations/20260916000300_cloud_initial/migration.sql', import.meta.url), 'utf8'));
  const socket = new PGLiteSocketServer({ db, port: 0, maxConnections: 3 });
  await socket.start();
  let child, base, cookie = '';
  const env = { ...process.env, NODE_ENV: 'test', VERCEL: '1', DATABASE_URL: `postgresql://postgres@${socket.getServerConn()}/postgres`,
    SESSION_SECRET: crypto.randomBytes(48).toString('hex'), RAILGO_TEST_FIXTURES: 'false', FRONTEND_URL: 'http://localhost:4173',
    OPENAI_API_KEY: '', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-only', EMAIL_FROM: 'login@example.test',
    MAIL_TEST_OUTBOX: path.resolve(`test-results/cloud-mail-${crypto.randomUUID()}`) };
  async function stop() {
    if (child && child.exitCode === null) { const exit = once(child, 'exit'); child.kill(); await exit; }
  }
  t.after(async () => { await stop(); await socket.stop(); await db.close(); });
  async function start() {
    child = spawn(process.execPath, ['--import', './tests/email-provider.fixture.js', 'tests/cloud-server.fixture.js'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Cloud test startup timed out')), 20000);
      child.stdout.on('data', data => { const port = String(data).match(/Cloud test port (\d+)/); if (port) { clearTimeout(timer); resolve(`http://127.0.0.1:${port[1]}`); } });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Cloud test process exited')); });
    });
  }
  async function request(route, body, useCookie = true) {
    const response = await fetch(base + '/api/' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(useCookie && cookie && { Cookie: cookie }) }, ...(body && { body: JSON.stringify(body) }) });
    const setCookie = response.headers.getSetCookie(); if (useCookie && setCookie.length) cookie = setCookie.map(c => c.split(';')[0]).join('; ');
    return { status: response.status, data: await response.json() };
  }
  await start();
  assert.equal((await request('health')).status, 200);
  assert.equal((await request('auth/config')).data.configured, true);
  assert.ok((await request('stations?q=KPD')).data.some(s => s.code === 'KPD'));
  assert.ok((await request('trains/12639')).data.route.length > 2);
  const email = 'cloud@example.test';
  assert.equal((await request('auth/email/send', { email, profile: testProfile })).status, 200);
  const code = readEmailCode(env.MAIL_TEST_OUTBOX, email);
  assert.equal((await request('auth/email/verify', { email, code }, false)).status, 400, 'Another browser cannot consume the code');
  await stop(); await start();
  assert.equal((await request('auth/config')).data.pending.email, email);
  const verified = await request('auth/email/verify', { email, code });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.user.emailVerified, true);
  await stop(); await start();
  assert.equal((await request('auth/me')).data.user.id, verified.data.user.id);
  assert.equal((await request('auth/email/verify', { email, code })).status, 400, 'Consumed code cannot be reused');
  const rows = await db.query('SELECT "hits" FROM "RateLimit"');
  assert.ok(rows.rows.some(row => row.hits >= 3), 'Counters survive process replacement');
  assert.equal((await request('auth/logout', {})).status, 200);
  assert.equal((await request('auth/me')).status, 401);
});
