import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { databaseEnvironment, readEmailCode } from './helpers.js';

test('email OTP login, checkout, reload/restart persistence, tracking and responsive frontend', { timeout: 180000 }, async t => {
  const env = { ...databaseEnvironment('fullstack-browser'), PORT: '4189' };
  const base = 'http://127.0.0.1:4189';
  let child, browser, page, preview;
  t.signal.addEventListener('abort', () => { child?.kill('SIGKILL'); browser?.close().catch(() => {}); }, { once: true });
  async function start() {
    child = spawn(process.execPath, ['--import', './tests/email-provider.fixture.js', 'server.js'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server start timed out')), 15000);
      child.stdout.on('data', data => { if (String(data).includes('Live Train v2 running')) { clearTimeout(timer); resolve(); } });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    });
  }
  async function stop() {
    const process = child;
    if (!process || process.exitCode !== null || process.signalCode !== null) return;
    let forced = false;
    const exited = new Promise(resolve => process.once('exit', resolve));
    const deadline = setTimeout(() => { forced = true; process.kill('SIGKILL'); }, 10000);
    process.kill();
    try { await exited; } finally { clearTimeout(deadline); }
    assert.equal(forced, false, 'Server must shut down within ten seconds');
  }
  try {
    await start();
    const executablePath = process.env.BROWSER_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const Original = window.EventSource;
      window.__streams = [];
      window.EventSource = class extends Original {
        constructor(...args) { super(...args); window.__streams.push(this); }
      };
    });
    let weatherRequests = 0;
    page.on('request', request => { if (request.url().includes('/api/weather?')) weatherRequests++; });
    // Exercise the same cross-origin navigation used by configured Pages/Vercel builds.
    const frontend = express();
    frontend.get('/config.js', (_req, res) => res.type('js').send(`window.LIVE_TRAIN_CONFIG = ${JSON.stringify({ apiBase: base })};`));
    frontend.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
    preview = frontend.listen(0, '127.0.0.1');
    await new Promise(resolve => preview.once('listening', resolve));
    await page.goto(`http://127.0.0.1:${preview.address().port}/`, { waitUntil: 'commit' });
    await page.waitForURL(`${base}/login`);
    await page.waitForFunction(() => !document.getElementById('authSubmit').disabled);
    await page.locator('#authEmail').fill('traveller@example.test');
    await page.locator('#authSubmit').click();
    await page.locator('#authEmailCode').waitFor();
    await page.reload();
    await page.locator('#authEmailCode').fill(readEmailCode(env.MAIL_TEST_OUTBOX, 'traveller@example.test'));
    await page.locator('#authSubmit').click();
    await page.waitForURL('**/dashboard');
    await page.waitForFunction(() => RailGoAuth.user && document.querySelectorAll('.train-card').length === 2);
    assert.equal(await page.locator('#authPhone, #otpForm, #googleLogin').count(), 0);
    await page.locator('#profileBtn').click();
    assert.match(await page.locator('#modalBody').innerText(), /traveller@example.test/);
    await page.locator('#modalClose').click();
    await page.locator('#passengers').selectOption('2');
    await page.locator('[data-book]').first().click();
    await page.waitForSelector('.seat-button:not(.booked)');
    await page.locator('[data-passenger-name]').nth(0).fill('First Traveller');
    await page.locator('[data-passenger-name]').nth(1).fill('Second Traveller');
    await page.locator('[data-passenger-age]').nth(0).fill('28');
    await page.locator('[data-passenger-age]').nth(1).fill('32');
    await page.locator('.seat-button:not(.booked)').first().click();
    await page.locator('#confirmBooking').click();
    await page.waitForFunction(() => document.querySelector('#modalBody').textContent.includes('CONFIRMED'));
    const pnr = (await page.locator('#modalBody').innerText()).match(/\b\d{10}\b/)[0];
    await page.locator('#modalClose').click();
    await page.reload();
    await page.waitForFunction(pnr => document.querySelector('#bookingList').textContent.includes(pnr), pnr);
    await stop(); await start();
    await page.reload();
    await page.waitForFunction(pnr => RailGoAuth.user && document.querySelector('#bookingList').textContent.includes(pnr), pnr);
    console.log('Browser check: booking survived server restart.');
    await page.locator('#upcomingJourneys [data-ticket]').click();
    assert.match(await page.locator('#modalBody').innerText(), new RegExp(pnr));
    await page.locator('#modalClose').click();
    assert.equal((await (await page.request.get(`${base}/api/bookings/${pnr}`)).json()).passengerDetails.length, 2);
    await page.locator('#quickTrackInput').fill(pnr);
    await page.locator('#quickTrackBtn').click();
    await page.waitForFunction(() => state.lastLive && state.map && state.trainMarker);
    await page.locator('#quickTrackInput').fill('12639');
    await page.locator('#quickTrackBtn').click();
    await page.waitForFunction(() => state.lastLive?.trainNo === '12639');
    const layers = await page.evaluate(() => state.routeLayer.getLayers().length);
    const weatherBefore = weatherRequests;
    const updated = await page.evaluate(() => state.lastLive.updatedAt);
    await page.waitForFunction(previous => state.lastLive.updatedAt !== previous, updated);
    assert.equal(await page.evaluate(() => state.routeLayer.getLayers().length), layers);
    assert.equal(await page.evaluate(() => window.__streams.filter(s => s.readyState !== 2).length), 1);
    assert.equal(weatherRequests, weatherBefore);
    await page.locator('#quickTrackInput').fill('TR101'); await page.locator('#quickTrackBtn').click();
    await page.waitForFunction(() => state.lastLive?.trainNo === 'TR101');
    assert.equal(await page.evaluate(() => window.__streams.filter(s => s.readyState !== 2).length), 1);
    await page.waitForFunction(() => state.poiLayer.getLayers().length === 4);
    assert.equal(await page.evaluate(() => {
      const before = state.lastLive.updatedAt;
      applyLiveState({ ...state.lastLive, updatedAt: '2000-01-01T00:00:00Z', speedKmph: 999 });
      return state.lastLive.updatedAt === before;
    }), true, 'Late telemetry must not overwrite current position');
    await page.route('**/api/weather?*', route => route.fulfill({ json: { current: { temperature_2m: 28, time: '2099-01-01T12:00' }, hourly: { time: ['2099-01-01T10:00'], temperature_2m: [20] } } }));
    await page.evaluate(() => loadWeather(state.lastLive.lat, state.lastLive.lng));
    assert.equal(await page.locator('#feelsValue').innerText(), '—');
    assert.equal(await page.locator('#windValue').innerText(), '—');
    assert.ok(!(await page.locator('#forecastRow').innerText()).includes('20°'), 'Past forecasts must not be reused as future weather');
    await page.unroute('**/api/weather?*');
    console.log('Browser check: tracking streams and weather completed.');
    await page.locator('#toStation').selectOption('SBC');
    await page.evaluate(() => loadSpots());
    await page.waitForFunction(() => document.querySelectorAll('.spot-card').length === 4);
    await page.locator('.spot-card img').first().scrollIntoViewIfNeeded();
    await page.locator('.spot-card img').first().evaluate(img => { img.src = './assets/missing-test-image.jpg'; });
    await page.waitForFunction(() => { const img = document.querySelector('.spot-card img'); return img.dataset.fallbackApplied === 'true' && img.complete && img.naturalWidth > 0 && img.src.includes('lalbagh.jpg'); });
    await page.screenshot({ path: 'test-results/fullstack-desktop.png', fullPage: true });
    for (const width of [360, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/fullstack-mobile.png', fullPage: true });
    await page.locator('[data-cancel-pnr]').click();
    await page.waitForFunction(() => document.querySelector('.booking-item').textContent.includes('CANCELLED'));
    await page.waitForFunction(() => /adventure|Sign in/.test(document.querySelector('#upcomingJourneys').textContent));
    await page.locator('#mobileProfile').click();
    assert.match(await page.locator('#modalBody').innerText(), /traveller@example.test/);
    await page.locator('#emailLogout').click();
    await page.waitForURL('**/login');
    assert.equal((await page.request.get(`${base}/api/bookings`)).status(), 401);
    assert.deepEqual(errors, []);
  } catch (error) {
    console.error('Browser failure state:', await page?.evaluate(() => ({
      path: location.pathname, userReady: Boolean(RailGoAuth.user),
    })).catch(() => 'Page unavailable'));
    await page?.screenshot({ path: 'test-results/fullstack-failure.png', timeout: 10000 }).catch(() => {});
    throw error;
  } finally {
    try { await browser?.close(); }
    finally { preview?.closeAllConnections(); if (preview) await new Promise(resolve => preview.close(resolve)); await stop(); }
  }
});
