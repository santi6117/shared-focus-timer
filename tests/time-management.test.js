// Time management through the Dashboard and database effects: history survives
// edits, totals reconcile, and failed or stale forms do not overwrite records.
import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setup, teardown, openApp, T0 } from "./helpers/harness.js";

before(setup);
after(teardown);
let app;
afterEach(async () => {
  if (!app) return;
  const errors = app.errors.map(String);
  await app.close();
  app = null;
  assert.deepEqual(errors, []);
});
const record = { endedAt: T0 - 3600_000, elapsedSeconds: 1800, categoryKey: "reading", timeZone: "America/New_York", activityVersion: 1 };
async function open(seed = record) {
  app = await openApp({ seedDb: {
    sessions: { santi: seed ? { a: seed } : {} },
    categories: { santi: { reading: { label: "Reading", color: "#c1714a" } } },
  } });
  await app.page.locator('#dashboardNav').click();
  await app.page.locator('#timeManager summary').click();
}
const row = (id = "a") => app.page.locator(`[data-session-id="${id}"]`);
async function total(text) {
  await app.page.waitForFunction((expected) => document.getElementById('statAll').textContent === expected, text);
}
async function calendar(seconds, count) {
  await app.page.waitForFunction(([seconds, count]) => {
    const days = Object.values(window.__fakeDb.get('activity/santi/days') || {});
    return days.reduce((n, d) => n + d.totalSeconds, 0) === seconds && days.reduce((n, d) => n + d.sessionCount, 0) === count;
  }, [seconds, count]);
}

async function pick(buttonId, query, choice) {
  await app.click(buttonId);
  const dialog = app.page.getByRole("dialog");
  await dialog.getByRole("searchbox").fill(query);
  await dialog.getByRole("button", { name: choice, exact: true }).click();
}

describe('Dashboard time management', () => {
  it("filters by task, adds missed task time, and undoes a reassignment with its duration", async () => {
    app = await openApp({ seedDb: {
      sessions: { santi: { a: record } },
      categories: { santi: { reading: { label: "Reading", color: "#c1714a" } } },
      progress: { santi: {
        board: {
          columns: {
            work: { title: "Work", status: "active", position: 0 },
            writing: { title: "Writing", status: "active", position: 1 },
          },
          tasks: {
            notes: { title: "Write notes", columnId: "writing", position: 0, completedAt: T0 - 1000 },
            reading: { title: "Read paper", columnId: "work", position: 1 },
          },
        },
        links: { a: { columnId: "work", taskId: "reading", note: "Keep this note" } },
      } },
    } });
    await app.click("dashboardNav");
    await app.page.locator("#timeManager summary").click();
    const categories = app.page.locator("#breakdownRows .cat-row .name");
    assert.deepEqual(await categories.allTextContents(), ["Work"]);
    await pick("timeFocusFilter", "Reading", "Reading Category");
    assert.match(await app.text("timeHistoryCount"), /No sessions match/);
    await pick("timeFocusFilter", "Read paper", "Read paper Task · Work");
    assert.match(await row().innerText(), /30m · Read paper/);
    await row().getByRole("button", { name: "Edit", exact: true }).click();
    await pick("timeFocusChoice", "Write notes", "Write notes Task · Writing");
    await app.page.locator("#timeMinutes").fill("20");
    await app.click("timeSave");
    assert.match(await app.text("timeHistoryCount"), /No sessions match/);
    assert.deepEqual(await categories.allTextContents(), ["Writing"]);
    await pick("timeFocusFilter", "Write notes", "Write notes Task · Writing");
    assert.match(await row().innerText(), /20m · Write notes/);
    const edited = await app.db("sessions/santi/a");
    const revision = edited.timeEdits[edited.activeEdit].progressRevision;
    assert.deepEqual(await app.db("progress/santi/links/a/targets/" + revision),
      { columnId: "writing", taskId: "notes" });
    assert.equal(await app.db("progress/santi/links/a/note"), "Keep this note");
    assert.doesNotMatch(JSON.stringify(edited), /taskId|columnId|Write notes/);
    await row().getByRole("button", { name: "Undo", exact: true }).click();
    assert.deepEqual(await categories.allTextContents(), ["Work"]);
    await pick("timeFocusFilter", "Read paper", "Read paper Task · Work");
    assert.match(await row().innerText(), /30m · Read paper/);

    await app.click("timeAdd");
    await pick("timeFocusChoice", "Read paper", "Read paper Task · Work");
    await app.page.locator("#timeMinutes").fill("15");
    await app.click("timeSave");
    assert.equal(await app.page.locator("#timeHistory li").count(), 2);
    await app.page.locator("#dashboardView").getByRole("link", { name: "Progress" }).click();
    assert.match(await app.page.getByRole("region", { name: "Work", exact: true }).textContent(), /Total 45m/);
  });

  it('adds missed work to personal totals, categories and calendar, then undoes the addition', async () => {
    await open(null);
    await app.click('timeAdd');
    await app.page.locator('#timeEnd').fill('2026-09-30T08:00');
    await app.page.locator('#timeMinutes').fill('45');
    await pick("timeFocusChoice", "Reading", "Reading Category");
    await app.click('timeSave');
    await total('45m');
    await calendar(2700, 1);
    const raw = await app.db('sessions/santi');
    const id = Object.keys(raw)[0];
    assert.equal(raw[id].source, 'manual');
    assert.equal(raw[id].timeEdits[1].elapsedSeconds, 2700);
    assert.match(await app.page.locator('#breakdownRows').innerText(), /Reading/);
    await row(id).getByRole('button', { name: 'Undo', exact: true }).click();
    await total('0m');
    await calendar(0, 0);
    assert.ok(await app.db(`sessions/santi/${id}`), 'undo retains the original record');
    assert.match(await row(id).innerText(), /Removed/);
  });

  it('corrects a duration without overwriting the original and supports repeated undo', async () => {
    await open();
    await row().getByRole('button', { name: 'Edit', exact: true }).click();
    await app.page.locator('#timeMinutes').fill('10');
    await app.click('timeSave');
    await total('10m');
    await calendar(600, 1);
    const raw = await app.db('sessions/santi/a');
    assert.equal(raw.elapsedSeconds, 1800);
    assert.equal(raw.timeEdits[1].elapsedSeconds, 600);
    await row().getByRole('button', { name: 'Edit', exact: true }).click();
    await app.page.locator('#timeMinutes').fill('20');
    await app.click('timeSave');
    await total('20m');
    await app.page.reload();
    await app.run(100);
    await app.page.locator('#timeManager summary').click();
    await row().getByRole('button', { name: 'Undo', exact: true }).click();
    await total('10m');
    await row().getByRole('button', { name: 'Undo', exact: true }).click();
    await total('30m');
    await calendar(1800, 1);
    assert.equal(Object.keys((await app.db('sessions/santi/a')).timeEdits).length, 2);
  });

  it('reviews removal, clears the last shared day, and restores work', async () => {
    await open();
    await calendar(1800, 1);
    await row().getByRole('button', { name: 'Remove', exact: true }).click();
    await app.click('timeRemoveCancel');
    await total('30m');
    assert.equal((await app.db('sessions/santi/a')).editVersion, undefined);
    await row().getByRole('button', { name: 'Remove', exact: true }).click();
    await app.click('timeRemoveConfirm');
    await total('0m');
    await calendar(0, 0);
    assert.equal(await app.text('statCount'), '0 sessions logged');
    assert.equal(await app.db('room/santi/lifetimeFocusSeconds'), 0);
    await row().getByRole('button', { name: 'Restore', exact: true }).click();
    await total('30m');
    await calendar(1800, 1);
    assert.equal((await app.db('sessions/santi/a')).elapsedSeconds, 1800);
  });

  it('moves an edited session between days without changing its duration', async () => {
    await open();
    await calendar(1800, 1);
    await row().getByRole('button', { name: 'Edit', exact: true }).click();
    await app.page.locator('#timeEnd').fill('2026-09-29T09:00');
    await app.click('timeSave');
    await app.page.waitForFunction(() => window.__fakeDb.get('activity/santi/days/2026-09-29/totalSeconds') === 1800);
    assert.equal(await app.db('activity/santi/days/2026-09-30/totalSeconds'), 0);
    assert.equal(await app.text('statToday'), '0m');
    await total('30m');
  });

  it('keeps corrections to unshared historical records private', async () => {
    const legacy = { ...record };
    delete legacy.activityVersion;
    await open(legacy);
    await row().getByRole('button', { name: 'Edit', exact: true }).click();
    await app.page.locator('#timeMinutes').fill('15');
    await app.click('timeSave');
    await total('15m');
    assert.equal(await app.db('activity/santi/days'), null);
    assert.equal((await app.db('sessions/santi/a')).activityVersion, undefined);
  });

  it('rejects a stale form when another device changes the same session', async () => {
    await open();
    await row().getByRole('button', { name: 'Edit', exact: true }).click();
    await app.page.locator('#timeMinutes').fill('10');
    await app.remote('sessions/santi/a', { ...record, editVersion: 1, activeEdit: 1, timeEdits: {
      1: { ...record, elapsedSeconds: 900, previousEdit: 0 },
    } });
    await app.click('timeSave');
    assert.match(await app.text('timeStatus'), /another device/);
    await total('15m');
    assert.equal((await app.db('sessions/santi/a')).editVersion, 1);
    assert.equal(await app.page.locator('#timeMinutes').inputValue(), '10', 'keep the draft for review');
  });

  it('keeps failed additions retryable without duplicate records and blocks offline edits', async () => {
    await open(null);
    await app.click('timeAdd');
    await app.page.locator('#timeMinutes').fill('30');
    await app.page.evaluate(() => window.__fakeDb.failSessionTransactions());
    await app.click('timeSave');
    assert.match(await app.text('timeStatus'), /permission failure/);
    assert.equal(await app.db('sessions/santi'), null);
    await app.click('timeSave');
    await total('30m');
    const records = await app.db('sessions/santi');
    assert.equal(Object.keys(records).length, 1);
    const id = Object.keys(records)[0];
    await row(id).getByRole('button', { name: 'Edit', exact: true }).click();
    await app.page.locator('#timeMinutes').fill('60');
    await app.remote('.info/connected', false);
    await app.click('timeSave');
    assert.match(await app.text('timeStatus'), /Connect/);
    await total('30m');
    assert.equal((await app.db(`sessions/santi/${id}`)).editVersion, 1);
  });

  it('rejects a future end time and preserves a draft across navigation', async () => {
    await open(null);
    await app.click('timeAdd');
    await app.page.locator('#timeEnd').fill('2026-10-02T10:00');
    await app.page.locator('#timeMinutes').fill('30');
    await app.click('timeSave');
    assert.match(await app.text('timeStatus'), /past/);
    assert.equal(await app.db('sessions/santi'), null);
    await app.click('timerNav');
    await app.click('dashboardNav');
    await app.page.locator('#dashboardView').waitFor({ state: 'visible' });
    assert.equal(await app.page.locator('#timeMinutes').inputValue(), '30');
    assert.equal(await app.page.locator('#timeForm').isVisible(), true);
  });
});
