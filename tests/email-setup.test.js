import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { get } from 'node:http';
import { createEmailSetup, gmailEnvironment } from '../scripts/setup-email.js';

async function setup(t, transportFactory) {
  await mkdir('test-results', { recursive: true });
  const directory = await mkdtemp('test-results/email-setup-'), envFile = `${directory}/.env`;
  const secret = randomBytes(48).toString('hex');
  const original = `# Keep existing settings\nPORT=4174\nDATABASE_URL=file:./prisma/railgo.db\nSESSION_SECRET=${secret}\nSMTP_HOST=\nSMTP_PASS=\n`;
  await writeFile(envFile, original);
  const server = createEmailSetup({ envFile, transportFactory, nodeEnv: 'test' }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(origin);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const html = await page.text(), token = html.match(/name="token" value="([a-f0-9]+)"/)[1];
  assert.ok(!html.includes(secret));
  const password = randomBytes(8).toString('hex');
  const submit = (values = {}, headers = {}) => fetch(origin + '/configure', { method: 'POST', headers: { Origin: origin, ...headers }, body: new URLSearchParams({ token, email: 'sender@gmail.com', password, ...values }) });
  return { envFile, original, secret, origin, password, submit };
}

test('local Gmail setup verifies sender before saving and preserves unrelated settings', async t => {
  let calls = 0, closed = false;
  const fixture = await setup(t, env => {
    assert.equal(env.SMTP_HOST, 'smtp.gmail.com');
    assert.equal(env.SMTP_PORT, '465');
    return { verify: async () => { calls++; assert.equal(await readFile(fixture.envFile, 'utf8'), fixture.original); }, close: () => { closed = true; } };
  });
  const result = await fixture.submit(), html = await result.text();
  assert.equal(result.status, 200);
  assert.match(html, /Gmail sender connected/);
  assert.equal(html.includes(fixture.password), false);
  assert.equal(html.includes(fixture.secret), false);
  const written = await readFile(fixture.envFile, 'utf8'), env = parse(written);
  assert.equal(env.EMAIL_PROVIDER, 'smtp');
  assert.equal(env.SMTP_PASS, fixture.password);
  assert.equal(env.SESSION_SECRET, fixture.secret);
  assert.equal(env.DATABASE_URL, 'file:./prisma/railgo.db');
  assert.equal(env.EMAIL_FROM, 'RailGo <sender@gmail.com>');
  assert.equal(written.split('\n').filter(line => line.split('=')[0] === 'SMTP_PASS').length, 1);
  assert.equal(calls, 1); assert.equal(closed, true);
  assert.equal((await fixture.submit()).status, 429);
});

test('failed sender authentication never saves or reflects a password', async t => {
  let closed = false;
  const fixture = await setup(t, () => ({ verify: async () => { throw Object.assign(new Error('private SMTP detail'), { code: 'EAUTH' }); }, close: () => { closed = true; } }));
  const result = await fixture.submit(), html = await result.text();
  assert.equal(result.status, 502);
  assert.match(html, /valid Gmail App Password/);
  assert.equal(html.includes('private SMTP detail'), false);
  assert.equal(html.includes(fixture.password), false);
  assert.equal(await readFile(fixture.envFile, 'utf8'), fixture.original);
  assert.equal(closed, true);
});

test('setup rejects cross-origin posts, invalid tokens, rebound hosts and malformed input', async t => {
  const fixture = await setup(t, () => { throw new Error('Must not contact SMTP'); });
  assert.equal((await fixture.submit({}, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await fixture.submit({}, { Origin: '' })).status, 403);
  assert.equal((await fixture.submit({ token: 'invalid' })).status, 403);
  assert.equal((await fixture.submit({ token: 'é'.repeat(64) })).status, 403);
  const reboundStatus = await new Promise((resolve, reject) => get(fixture.origin, { headers: { Host: 'untrusted.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject));
  assert.equal(reboundStatus, 403);
  assert.equal((await fixture.submit({ password: 'short' })).status, 400);
  assert.equal((await fixture.submit({ email: 'sender@other.example' })).status, 400);
  assert.equal(await readFile(fixture.envFile, 'utf8'), fixture.original);
  assert.throws(() => createEmailSetup({ nodeEnv: 'production' }), /local only/);
  assert.throws(() => gmailEnvironment({ email: 'bad\n@gmail.com', password: fixture.password }), /Gmail address/);
  assert.equal(gmailEnvironment({ email: ' SENDER@GMAIL.COM ', password: fixture.password.match(/.{4}/g).join(' ') }).SMTP_PASS, fixture.password);
});
