// Verify the standalone design study without connecting it to real focus records.
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './helpers/server.js';

it('cottage preview gates the door and supports reversible decoration at narrow widths', async () => {
  const server = await startServer();
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(server.url + 'prototypes/cottage/');
    await page.getByRole('button', { name: 'Before unlock' }).click();
    assert.equal(await page.locator('#locked').isVisible(), true);
    assert.equal(await page.locator('#door').isVisible(), false);
    await page.getByRole('button', { name: 'Get the keys' }).click();
    await page.getByRole('button', { name: 'Open the cottage door' }).click();
    assert.equal(await page.locator('#inside').isVisible(), true);
    await page.getByRole('button', { name: 'Decorate', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Woven rug' }).isDisabled(), true);
    await page.locator('#hours').fill('105');
    await page.getByRole('button', { name: 'Woven rug' }).click();
    assert.equal(await page.locator('#rug').isVisible(), true);
    await page.getByRole('button', { name: 'Woven rug' }).click();
    assert.equal(await page.locator('#rug').isVisible(), false);
    await page.getByRole('button', { name: 'Place all unlocked' }).click();
    assert.equal(await page.locator('#rug').isVisible(), true);
    assert.equal(await page.locator('#plant').isVisible(), false);
    await page.getByRole('button', { name: 'Woven rug' }).click();
    await page.getByRole('button', { name: 'All furnished' }).click();
    for (const name of ['Woven rug', 'Little plant', 'Bookshelf', 'Warm lamp', 'Window flowers', 'Linen curtains', 'Coffee', 'Botanical print', 'Reading armchair', 'Blanket', 'Fireplace', 'Log basket', 'Sleeping cat', 'You & Kristina']) {
      await page.getByRole('button', { name }).click();
    }
    await page.getByRole('button', { name: 'Sleeping cat' }).click();
    await page.getByRole('button', { name: 'Place all unlocked' }).click();
    assert.equal(await page.locator('#cat').isVisible(), true);
    assert.equal(await page.locator('.cat-breath').evaluate(node => getComputedStyle(node).animationPlayState), 'running');
    const firstBreath = await page.locator('.cat-breath').evaluate(node => getComputedStyle(node).transform);
    await page.waitForTimeout(250);
    assert.notEqual(await page.locator('.cat-breath').evaluate(node => getComputedStyle(node).transform), firstBreath);
    assert.equal(await page.locator('.fire-flicker').evaluate(node => getComputedStyle(node).animationName), 'flame-sway');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const selector of ['.cat-breath', '.fire-flicker', '.fire-core']) {
      assert.equal(await page.locator(selector).evaluate(node => getComputedStyle(node).animationName), 'none');
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    assert.equal(await page.locator('#portrait').isVisible(), true);
    assert.match(await page.locator('#nextLabel').textContent(), /fully unlocked/);
    await page.getByRole('button', { name: 'Outside', exact: false }).click();
    assert.equal(await page.locator('#flowers').isVisible(), true);
    await page.setViewportSize({ width: 320, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '/tmp/cottage-prototype-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1100, height: 850 });
    await page.getByRole('button', { name: 'Open the cottage door' }).click();
    await page.screenshot({ path: '/tmp/cottage-prototype.png', fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
