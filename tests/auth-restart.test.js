import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { databaseEnvironment, testProfile, readEmailCode } from './helpers.js';

test('pending OTP and authenticated sessions survive a Node process restart', { timeout: 180000 }, async t => {
  const env = { ...databaseEnvironment('auth-restart', { fixtures: true }), PORT: '4193' }, base = 'http://127.0.0.1:4193';
  let child, cookie = '';
  async function stop() { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } }
  t.after(stop);
  async function start() {
    child = spawn(process.execPath, ['--import', './tests/email-provider.fixture.js', 'server.js'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Test backend startup timed out')), 20000); child.stdout.on('data', data => { if (String(data).includes('Live Train v2 running')) { clearTimeout(timer); resolve(); } }); child.once('exit', () => { clearTimeout(timer); reject(new Error('Test backend stopped during startup')); }); });
  }
  async function request(route, body) {
    const response = await fetch(base + '/api/auth/' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) }, ...(body && { body: JSON.stringify(body) }) });
    const next = response.headers.getSetCookie(); if (next.length) cookie = next.map(value => value.split(';')[0]).join('; ');
    return { status: response.status, data: await response.json() };
  }
  await start();
  const email = 'restart@example.test';
  assert.equal((await request('email/send', { email, profile: testProfile })).status, 200);
  const code = readEmailCode(env.MAIL_TEST_OUTBOX, email);
  await stop(); await start();
  assert.equal((await request('config')).data.pending.email, email);
  const verified = await request('email/verify', { email, code }); assert.equal(verified.status, 200);
  await stop(); await start();
  assert.equal((await request('me')).data.user.id, verified.data.user.id);
  assert.equal((await request('email/verify', { email, code })).status, 400, 'Consumed codes remain unusable after restart');
});
