import { checkTracking } from './tracking-browser-checks.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

test('voice assistant: app actions, speech lifecycle, errors and responsive UI', { timeout: 90000 }, async () => {
  const port = '4187', base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: port, OPENAI_API_KEY: '' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Test server startup timed out')), 10000);
      child.stdout.on('data', data => { if (String(data).includes('Live Train v2 running')) { clearTimeout(timeout); resolve(); } });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Test server exited (${code})`)); });
    });
    const executablePath = process.env.BROWSER_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.__speechSessions = [];
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      window.SpeechRecognition = class {
        constructor() { window.__speechSessions.push(this); }
        start() { this.started = true; this.onstart?.(); }
        stop() { this.onend?.(); }
        abort() { this.aborted = true; this.onend?.(); }
      };
      Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [{ lang: 'en-IN' }, { lang: 'ta-IN' }], speak: line => { window.__lastSpeech = line.text; }, cancel: () => {} } });
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('.train-card').length > 0);
    await checkTracking(page);
    await page.locator('#assistantLaunch').click();
    await page.waitForFunction(() => document.getElementById('assistantMode').textContent.includes('Basic commands'));
    const send = async text => {
      const count = await page.locator('.assistant-message.assistant').count();
      await page.locator('#assistantInput').fill(text); await page.locator('#assistantSend').click();
      await page.waitForFunction(n => document.querySelectorAll('.assistant-message.assistant').length > n && !document.getElementById('assistantSend').disabled, count);
      return page.locator('.assistant-message.assistant p').last().innerText();
    };
    const reply = await send('Chennai to Coimbatore tomorrow for two passengers');
    assert.match(reply, /Coimbatore/); assert.equal(await page.locator('#toStation').inputValue(), 'CBE'); assert.equal(await page.locator('#passengers').inputValue(), '2');
    assert.equal(await page.locator('.train-card').count(), 2);
    await send('Track 12639'); assert.match(await page.locator('#trackingTrainName').innerText(), /Brindavan/);
    assert.match(await send('Weather in Delhi'), /Which supported city/);
    await page.locator('#assistantLanguage').selectOption('ta-IN');
    const tamil = await send('என் டிக்கெட்டுகள்'); assert.match(tamil, /டிக்கெட்டுகளை/);
    await page.locator('#assistantMic').click();
    assert.equal(await page.locator('#assistantMic').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => {
      const r = window.__speechSessions.at(-1); r.onresult({ results: [Object.assign([{ transcript: '12639 ரயில் எங்கே' }], { isFinal: true })] });
    });
    await page.waitForFunction(() => document.querySelector('.assistant-message.user:last-of-type') || !document.getElementById('assistantSend').disabled);
    await page.waitForFunction(() => document.getElementById('assistantStatus').textContent.includes('அடுத்த'));
    assert.match(await page.locator('.assistant-message.assistant p').last().innerText(), /டெமோ கண்காணிப்பு/);
    assert.equal(await page.locator('#assistantMic').getAttribute('aria-pressed'), 'false');
    await page.locator('#assistantLanguage').selectOption('en-IN');
    await page.locator('#assistantMic').click();
    await page.evaluate(() => { const r = window.__speechSessions.at(-1); r.onerror({ error: 'not-allowed' }); r.onend(); });
    assert.match(await page.locator('#assistantStatus').innerText(), /permission was denied/);
    await page.locator('#assistantMic').click();
    await page.locator('#assistantClose').click();
    assert.equal(await page.evaluate(() => window.__speechSessions.at(-1).aborted), true);
    assert.equal(await page.locator('#railgoAssistant').isVisible(), false);
    await page.locator('#assistantLaunch').click();
    await page.route('**/api/assistant', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Service unavailable. Try again.' }) }));
    assert.match(await send('hello'), /Service unavailable/);
    await page.unroute('**/api/assistant');
    await page.locator('#assistantClear').click();
    await page.locator('#assistantInput').fill('<img src=x onerror=alert(1)>');
    await page.locator('#assistantSend').click();
    await page.waitForFunction(() => !document.getElementById('assistantSend').disabled);
    assert.equal(await page.locator('#assistantMessages img').count(), 0);
    mkdirSync('test-results', { recursive: true });
    await page.locator('#assistantClear').click(); await send('Track 12639');
    await page.screenshot({ path: 'test-results/assistant-desktop.png' });
    for (const width of [360, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
      const box = await page.locator('#railgoAssistant').boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/assistant-mobile.png' });
    const unsupported = await browser.newPage();
    await unsupported.addInitScript(() => { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; });
    await unsupported.goto(base, { waitUntil: 'domcontentloaded' }); await unsupported.locator('#assistantLaunch').click();
    assert.equal(await unsupported.locator('#assistantMic').isDisabled(), true);
    assert.match(await unsupported.locator('#assistantStatus').innerText(), /unavailable in this browser/);
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); child.kill(); }
});
