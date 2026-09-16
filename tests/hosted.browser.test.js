import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import express from 'express';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import nodemailer from 'nodemailer';
import { chromium } from 'playwright';
import { databaseEnvironment, testProfile } from './helpers.js';
import { configureHostedFrontend } from '../scripts/hosting-config.js';

test('Vercel and Pages share an HTTPS OTP backend, with a cookie-blocking fallback', { timeout: 180000 }, async t => {
  const env = databaseEnvironment('hosted-browser');
  const folder = path.resolve(await mkdtemp('test-results/hosted-'));
  const keyFile = path.join(folder, 'key.pem'), certFile = path.join(folder, 'cert.pem');
  const openssl = process.platform === 'win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe') ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
  const certificate = spawnSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=api.live-train.test', '-addext', 'subjectAltName=DNS:api.live-train.test,DNS:site.vercel.test,DNS:owner.github.test'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
  assert.equal(certificate.status, 0, 'OpenSSL must be available to generate isolated test HTTPS certificates');
  let app, browser;
  const frontends = express(), mails = new Map();
  const server = https.createServer({ key: await readFile(keyFile), cert: await readFile(certFile) }, (req, res) => {
    const host = req.headers.host.split(':')[0];
    if (host === 'api.live-train.test') app(req, res); else frontends(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const backend = `https://api.live-train.test:${port}`, vercel = `https://site.vercel.test:${port}`, pages = `https://owner.github.test:${port}`;
  Object.assign(process.env, env, { NODE_ENV: 'production', PORT: String(port), FRONTEND_URL: backend, RENDER_EXTERNAL_URL: backend, ALLOWED_ORIGINS: `${vercel},${pages}`, TRUST_PROXY: 'true', SESSION_SAME_SITE: 'none', EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'sender@gmail.com', SMTP_PASS: 'test-only', EMAIL_FROM: 'Live Train <sender@gmail.com>' });
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async message => { mails.set(message.to[0], message.text.match(/\b\d{6}\b/)[0]); return { accepted: message.to, rejected: [] }; }, close: () => {} }));
  ({ app } = await import('../server.js'));
  const { prisma } = await import('../backend/db.js');
  t.after(async () => { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); });
  for (const type of ['vercel', 'pages']) {
    const target = path.join(folder, type), assets = type === 'pages' ? path.join(target, 'public') : target;
    await mkdir(assets, { recursive: true }); await cp('public', assets, { recursive: true });
    await configureHostedFrontend(pathToFileURL(assets + path.sep), { RAILGO_BACKEND_URL: backend, RAILGO_REQUIRE_EMAIL_LOGIN: 'true', SMTP_PASS: 'test-only' });
    const source = (await readFile('public/index.html', 'utf8')).replace('<html lang="en">', '<html lang="en" data-hosting="static">').replace('<head>', `<head><base href="${type === 'pages' ? './public/' : '/'}">`);
    await writeFile(path.join(target, 'index.html'), source);
    frontends.use(type === 'pages' ? '/live-train-' : '/', express.static(target));
    assert.equal((await readFile(path.join(assets, 'config.js'), 'utf8')).includes('SMTP'), false);
  }
  const executablePath = process.env.BROWSER_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(executablePath && { executablePath }), args: ['--no-proxy-server', '--host-resolver-rules=MAP api.live-train.test 127.0.0.1, MAP site.vercel.test 127.0.0.1, MAP owner.github.test 127.0.0.1'] });
  for (const [index, site] of [vercel + '/', pages + '/live-train-/'].entries()) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(site, { waitUntil: 'domcontentloaded' });
    await page.locator('#profileBtn').click();
    await page.waitForFunction(() => !document.querySelector('#authSubmit').disabled);
    assert.equal(page.url(), site, 'Configured frontend remains on its own hosting origin');
    assert.equal(await page.evaluate(() => LiveTrainAPI.apiUrl('/api/auth/email/send')), backend + '/api/auth/email/send');
    const email = `hosted-${index}@example.test`;
    await page.locator('#authFirstName').fill(testProfile.firstName); await page.locator('#authBirthDate').fill(testProfile.dateOfBirth); await page.locator('#authMobile').fill(testProfile.mobileNumber); await page.locator('#authEmail').fill(email);
    const sentResponse = page.waitForResponse(response => response.url() === backend + '/api/auth/email/send' && response.request().method() === 'POST');
    await page.locator('#authSubmit').click(); const sent = await sentResponse;
    assert.equal(sent.status(), 200);
    assert.equal(sent.headers()['access-control-allow-origin'], new URL(site).origin);
    assert.equal(sent.headers()['access-control-allow-credentials'], 'true');
    assert.equal((await sent.json()).code, undefined);
    await page.locator('#authEmailCode').fill(mails.get(email)); await page.locator('#authSubmit').click();
    await page.waitForSelector('#profileName'); assert.equal(await page.locator('#profileEmail').innerText(), email);
    const cookie = (await context.cookies(backend)).find(value => value.name === 'railgo.sid');
    assert.equal(cookie.secure, true); assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, 'None');
    await page.reload(); await page.locator('#profileBtn').click();
    await page.waitForSelector('#profileEmail'); assert.equal(await page.locator('#profileEmail').innerText(), email);
    assert.equal((await prisma.user.findUnique({ where: { email } })).emailVerified, true);
    assert.deepEqual(errors, []); await context.close();
  }
  const context = await browser.newContext({ ignoreHTTPSErrors: true }), page = await context.newPage();
  await page.route(backend + '/api/auth/session', async route => {
    if (route.request().method() === 'GET') await route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': vercel, 'Access-Control-Allow-Credentials': 'true' }, body: '{"ready":false}' });
    else await route.continue();
  });
  await page.goto(vercel); await page.locator('#profileBtn').click();
  await page.waitForSelector('#authBackendLink');
  assert.equal(await page.locator('#authSubmit').isDisabled(), true);
  assert.equal(mails.size, 2, 'No OTP is sent when the cookie probe fails');
  await page.locator('#authBackendLink').click(); await page.waitForURL(backend + '/profile');
  await page.waitForFunction(() => !document.querySelector('#authSubmit').disabled);
  assert.equal(await page.evaluate(() => LiveTrainAPI.apiUrl('/api/auth/email/send')), backend + '/api/auth/email/send');
  await context.close();
});
