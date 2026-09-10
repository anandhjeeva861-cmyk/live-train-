import assert from 'node:assert/strict';

export async function checkTracking(page) {
  await page.locator('#fleetToggle').click();
  await page.waitForFunction(() => document.querySelectorAll('.fleet-train').length === 8);
  assert.match(await page.locator('#fleetCount').innerText(), /1,209/);
  await page.locator('#fleetQuery').fill('70000');
  await page.waitForFunction(() => document.querySelectorAll('.fleet-train').length === 1);
  await page.locator('.fleet-train').click();
  await page.waitForFunction(() => document.querySelector('#trackingTrainName').textContent.includes('70000') && document.querySelector('#nextArrival').textContent.includes('km away'));
  await page.waitForFunction(() => state.lastLive?.trainId === 'mock-1');
  const first = await page.evaluate(() => state.lastLive.updatedAt);
  await page.waitForFunction(previous => state.lastLive.updatedAt !== previous, first);
  await page.locator('#followTrain').click();
  assert.equal(await page.locator('#followTrain').getAttribute('aria-pressed'), 'true');
  await page.locator('#fitRoute').click();
  assert.equal(await page.locator('#followTrain').getAttribute('aria-pressed'), 'false');
  await page.locator('#expandMap').click();
  assert.equal(await page.locator('#expandMap').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#expandMap').getAttribute('aria-pressed'), 'false');
  await page.locator('#fleetQuery').fill('does-not-exist');
  await page.waitForFunction(() => document.querySelector('.fleet-empty'));
  await page.locator('#fleetQuery').fill('12639');
  await page.waitForFunction(() => document.querySelectorAll('.fleet-train').length === 1);
  await page.locator('.fleet-train').click();
  await page.waitForFunction(() => state.lastLive?.trainId === 'brindavan');
  await page.locator('#fleetQuery').fill('');
  await page.waitForFunction(() => document.querySelectorAll('.fleet-train').length === 8);
  await page.locator('#fleetNext').click();
  await page.waitForFunction(() => document.querySelector('#fleetCount').textContent.includes('9–16'));
  await page.locator('#fleetPrev').click();
  await page.waitForFunction(() => document.querySelector('#fleetCount').textContent.includes('1–8'));
  await page.locator('#fleetToggle').click();
}
