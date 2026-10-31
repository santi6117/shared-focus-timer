// Real dashboard behavior using fake Firebase, including corrected totals and saved decorations.
import { before, after, afterEach, it } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, openApp } from './helpers/harness.js';
import { REWARDS, earnedHours, validPlaced } from '../js/lib/cottage.js';
before(setup);
after(teardown);
let app;
afterEach(async () => { if (app) { const errors = app.errors.map(String); await app.close(); app = null; assert.deepEqual(errors, []); } });
const history = seconds => ({ sessions: { santi: { one: { endedAt: Date.now() - 100000, elapsedSeconds: seconds, categoryKey: 'school' } } } });
async function dashboard(seconds, options = {}) {
  app = await openApp({ seedDb: history(seconds), ...options });
  await app.page.goto(app.page.url().split('#')[0] + '#dashboard');
  await app.page.locator('#dashboardView').waitFor({ state: 'visible' });
}
it('keeps exact thresholds and sanitizes saved decoration IDs', () => {
  assert.equal(earnedHours(100 * 3600 - 1), 100 - 1 / 3600);
  assert.equal(earnedHours(0, 105), 105);
  assert.deepEqual(validPlaced(['rug', 'portrait', 'unknown'], 105), ['rug']);
  assert.equal(REWARDS.at(-1).hours, 200);
});
it('locks at just under 100 hours and opens on an exact 100-hour update', async () => {
  await dashboard(100 * 3600 - 1);
  assert.equal(await app.page.locator('#cottage-door').isVisible(), false);
  await app.page.evaluate(seconds => window.__fakeDb.set('sessions/santi/one/elapsedSeconds', seconds), 100 * 3600);
  await app.page.locator('#cottage-door').waitFor({ state: 'visible' });
  await app.page.locator('#cottage-door').click();
  await app.page.locator('#cottage-decorate').click();
  assert.equal(await app.page.getByRole('button', { name: 'Woven rug' }).isDisabled(), true);
});
it('saves per-person decorations and keeps earned rewards after corrections and reload', async () => {
  await dashboard(105 * 3600);
  await app.page.locator('#cottage-decorate').click();
  await app.page.getByRole('button', { name: 'Woven rug' }).click();
  assert.equal(await app.page.locator('#cottage-rug').isVisible(), true);
  await app.page.evaluate(() => window.__fakeDb.set('sessions/santi/one/elapsedSeconds', 0));
  await app.page.reload();
  await app.run(50);
  await app.page.locator('#cottage-door').click();
  assert.equal(await app.page.locator('#cottage-rug').isVisible(), true);
  await app.page.locator('#cottage-decorate').click();
  await app.page.getByRole('button', { name: 'Woven rug' }).click();
  assert.equal(await app.page.locator('#cottage-rug').isVisible(), false);
});
it('places all fourteen unlocked decorations, loads the photo and pauses off-dashboard', async () => {
  await dashboard(200 * 3600);
  await app.page.locator('#cottage-decorate').click();
  await app.page.locator('#cottagePlaceAll').click();
  for (const reward of REWARDS.filter(r => r.id !== 'flowers')) assert.equal(await app.page.locator('#cottage-' + reward.id).isVisible(), true);
  const photo = await app.page.locator('#cottage-portrait image').getAttribute('href');
  assert.equal((await app.page.request.get(new URL(photo, app.page.url()).href)).status(), 200);
  await app.page.locator('#timerNav').click();
  assert.equal(await app.page.locator('#cottageWidget').evaluate(node => node.classList.contains('motion-paused')), true);
});
it('handles invalid saved data without unlocking or breaking the dashboard', async () => {
  await dashboard(0, { seedStorage: { 'cottage:santi': '{bad json' } });
  assert.equal(await app.page.locator('#cottage-locked').isVisible(), true);
});
