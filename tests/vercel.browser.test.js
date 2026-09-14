import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import '../scripts/build-vercel.js';

test('Vercel routes load browser assets and allow bookings without login', { timeout: 90000 }, async () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const output = fileURLToPath(new URL(`../${config.outputDirectory}/`, import.meta.url));
  const app = express();
  app.use(express.static(output));
  for (const route of config.rewrites) app.get(route.source, (_req, res) => res.sendFile(output + route.destination));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let browser;
  try {
    const executablePath = process.env.BROWSER_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const errors = [], failedAssets = [], apiCalls = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().startsWith(origin) && response.status() >= 400) failedAssets.push(response.url()); });
    page.on('request', request => { if (request.url().startsWith(origin + '/api/')) apiCalls.push(request.url()); });
    for (const route of ['/', ...config.rewrites.map(route => route.source)]) {
      await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelectorAll('.train-card').length === 2);
      assert.equal(await page.evaluate(() => LiveTrainAPI.isStatic), true);
      assert.equal(await page.locator('#authPhone, #otpForm, #googleLogin, input[type="tel"]').count(), 0);
      if (route === '/login') {
        assert.equal(await page.locator('#authEmail').isVisible(), true);
        assert.equal(await page.locator('#authSubmit').isDisabled(), true);
        assert.match(await page.locator('#authError').innerText(), /No code has been sent/);
      }
    }
    await page.locator('[data-book]').first().click();
    await page.locator('.seat-button:not(.booked)').first().click();
    await page.locator('#confirmBooking').click();
    await page.waitForFunction(() => document.querySelector('#modalBody').textContent.includes('saved in this browser'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('.booking-item').length === 1);
    assert.deepEqual(apiCalls, []);
    assert.deepEqual(failedAssets, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
