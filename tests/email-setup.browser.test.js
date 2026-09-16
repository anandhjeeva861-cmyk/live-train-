import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { parse } from 'dotenv';
import { createEmailSetup } from '../scripts/setup-email.js';

test('native Gmail setup form sends a same-origin POST, saves privately and handles Gmail rejection', { timeout: 60000 }, async t => {
  const executablePath = process.env.BROWSER_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath && { executablePath }) });
  t.after(() => browser.close());
  const publicConfig = await readFile('public/config.js', 'utf8');
  for (const accepted of [true, false]) {
    await t.test(accepted ? 'successful native submit and refresh' : 'Gmail authentication error stays private', async sub => {
      await mkdir('test-results', { recursive: true });
      const directory = await mkdtemp('test-results/setup-browser-'), envFile = `${directory}/.env`;
      const sessionSecret = randomBytes(48).toString('hex'), password = randomBytes(8).toString('hex');
      const original = `PORT=4174\nDATABASE_URL=file:./prisma/dev.db\nSESSION_SECRET=${sessionSecret}\n`;
      await writeFile(envFile, original);
      let calls = 0, closed = false;
      const app = createEmailSetup({ envFile, nodeEnv: 'test', transportFactory: settings => ({
        verify: async () => {
          calls++;
          assert.equal(settings.SMTP_HOST, 'smtp.gmail.com');
          assert.equal(settings.SMTP_USER, 'sender@gmail.com');
          assert.equal(settings.SMTP_PASS, password);
          assert.equal(await readFile(envFile, 'utf8'), original, 'Verification precedes saving settings');
          if (!accepted) throw Object.assign(new Error(`Private provider detail: ${password}`), { code: 'EAUTH' });
          return true;
        }, close: () => { closed = true; }
      }) });
      const server = app.listen(0, '127.0.0.1');
      await new Promise(resolve => server.once('listening', resolve));
      sub.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
      const origin = `http://127.0.0.1:${server.address().port}`, posts = [];
      server.on('request', req => { if (req.method === 'POST') posts.push({ path: req.url, origin: req.headers.origin, type: req.headers['content-type'] }); });
      const context = await browser.newContext();
      sub.after(() => context.close());
      const page = await context.newPage(), urls = [], consoleMessages = [], pageErrors = [];
      page.on('request', req => urls.push(req.url()));
      page.on('console', message => consoleMessages.push(message.text()));
      page.on('pageerror', error => pageErrors.push(error.message));
      const initial = await page.goto(origin);
      assert.equal(initial.headers()['referrer-policy'], 'same-origin');
      assert.equal(await page.locator('script').count(), 0, 'The form must not pass credentials through frontend JavaScript');
      assert.match(await page.title(), /Live Train/);
      assert.doesNotMatch(await page.locator('body').innerText(), /railgo/i);
      assert.equal(await page.locator('form').getAttribute('method'), 'post');
      assert.equal(await page.locator('form').getAttribute('action'), '/configure');
      await page.getByLabel('Sender Gmail address').fill('sender@gmail.com');
      await page.getByLabel('Google App Password').fill(password.match(/.{4}/g).join(' '));
      const responsePromise = page.waitForResponse(response => response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Verify sender & save' }).click();
      const response = await responsePromise;
      assert.equal(response.url(), origin + '/configure');
      assert.deepEqual(posts, [{ path: '/configure', origin, type: 'application/x-www-form-urlencoded' }]);
      assert.equal(calls, 1);
      assert.equal(closed, true);
      if (accepted) {
        assert.equal(response.status(), 303);
        await page.waitForURL(origin + '/saved');
        assert.match(await page.getByRole('status').innerText(), /Gmail verified. Saved locally/);
        assert.equal(await page.getByRole('link', { name: 'Open Live Train Profile' }).getAttribute('href'), 'http://localhost:4174/profile');
        const env = parse(await readFile(envFile, 'utf8'));
        assert.equal(env.SMTP_PASS, password);
        assert.equal(env.SMTP_USER, 'sender@gmail.com');
        assert.equal(env.EMAIL_FROM, 'Live Train <sender@gmail.com>');
        assert.equal(env.SESSION_SECRET, sessionSecret);
        assert.equal(env.DATABASE_URL, 'file:./prisma/dev.db');
        await page.reload();
        assert.equal(posts.length, 1, 'Refreshing success must not resubmit the password');
      } else {
        assert.equal(response.status(), 502);
        assert.match(await page.getByRole('alert').innerText(), /Gmail rejected the sender login/);
        assert.equal(await page.getByLabel('Google App Password').inputValue(), '');
        assert.equal(await readFile(envFile, 'utf8'), original);
      }
      assert.equal((await page.content()).includes(password), false);
      assert.equal((await page.content()).includes(sessionSecret), false);
      assert.equal(JSON.stringify(await context.storageState()).includes(password), false);
      assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
      assert.ok(urls.every(url => url.startsWith(origin) && !url.includes(password) && !url.includes('?')));
      assert.ok(consoleMessages.every(message => !message.includes(password)));
      assert.deepEqual(pageErrors, []);
      assert.equal(await readFile('public/config.js', 'utf8'), publicConfig);
    });
  }
});
