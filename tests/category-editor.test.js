// Category editing through the Dashboard, including historical transfers and Undo.
import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { openApp, setup, teardown, MIN, T0 } from "./helpers/harness.js";

const at = T0 - MIN;
const day = 24 * 60 * MIN;
const record = (categoryKey, elapsedSeconds, endedAt = at) => ({ endedAt, elapsedSeconds, categoryKey });
const seedDb = {
  categories: { santi: {
    school: { label: "school!", color: "#7a9a6e" },
    classes: { label: "Classes", color: "#9a7aa0" },
  } },
  sessions: { santi: {
    school: record("school", 900),
    older: record("school", 1200, at - 14 * day),
    classes: record("classes", 1800),
  } },
};
const board = {
  columns: {
    classes: { title: "Classes", status: "active", position: 0 },
    reading: { title: "Reading", status: "active", position: 1 },
  },
  tasks: { paper: { title: "Read paper", columnId: "reading", position: 0 } },
};

let app;
before(setup);
after(teardown);
afterEach(async () => {
  if (!app) return;
  const errors = app.errors.map(String);
  await app.close();
  app = null;
  assert.deepEqual(errors, []);
});

const control = (name, root = app.page) => root.getByRole("button", { name, exact: true });
const dialog = () => app.page.locator("#categoryEditor");
const labels = () => app.page.locator("#breakdownRows .cat-row .name").allTextContents();

async function open(data = seedDb) {
  app = await openApp({ seedDb: data });
  await app.click("dashboardNav");
  await control("Edit categories").click();
}
async function transfer(from, to) {
  await control("Transfer time from " + from).click();
  await dialog().getByLabel("Move time to").selectOption(to);
}

describe("Dashboard category editing", () => {
  it("renames the existing category and reuses its key when typing the new name", async () => {
    await open();
    await control("Rename school!").click();
    const input = dialog().getByLabel("Name", { exact: true });
    await input.fill("Classes");
    await control("Save name", dialog()).click();
    assert.match(await dialog().getByRole("alert").innerText(), /already exists/);
    await input.fill("School and study");
    await control("Save name", dialog()).click();
    await dialog().waitFor({ state: "hidden" });
    assert.deepEqual(await labels(), ["Classes", "School and study"]);
    assert.deepEqual(await app.db("sessions/santi/school"), seedDb.sessions.santi.school);
    assert.equal((await app.db("categories/santi/school")).color, "#7a9a6e");

    await control("Rename School and study").click();
    await input.fill("School and reading");
    await control("Save name", dialog()).click();
    await dialog().waitFor({ state: "hidden" });
    assert.deepEqual(Object.values((await app.db("categories/santi/school")).aliases), ["school!", "school and study"]);
    await app.page.locator("#timerNav").click();
    await app.click("openFocusPicker");
    const search = app.page.getByRole("searchbox", { name: "Find a focus choice" });
    await search.fill("School and reading");
    assert.equal(await control("School and reading Category").count(), 1);
    assert.equal(await control("Use “School and reading” as category").count(), 0);
    await search.press("Enter");
    assert.equal(await app.text("focusChoice"), "School and reading");
    await app.click("startBtn");
    await app.fastForward(MIN);
    await app.click("resetBtn");
    const entries = Object.values(await app.db("sessions/santi"));
    assert.equal(entries.filter(({ categoryKey }) => categoryKey === "school").length, 3);
    assert.equal(await app.db("categories/santi/school and reading"), null);
  });

  it("transfers all-time history between standalone categories and undoes it in one action", async () => {
    await open();
    await transfer("school!", "category:classes");
    assert.match(await dialog().innerText(), /2 sessions · 35m across all time/);
    await control("Transfer time", dialog()).click();
    await dialog().waitFor({ state: "hidden" });
    assert.deepEqual(await labels(), ["Classes"]);
    assert.equal(await app.text("breakdownTotal"), "45m total");
    await control("All time").click();
    assert.equal(await app.text("breakdownTotal"), "1h 5m total");
    assert.match(await app.page.locator("#breakdownRows").innerText(), /Classes\s+1h 5m/);
    const log = await app.db("sessions/santi");
    assert.equal(log.older.categoryKey, "school");
    assert.equal(log.older.timeEdits[1].categoryKey, "classes");
    assert.equal(log.older.timeEdits[1].endedAt, seedDb.sessions.santi.older.endedAt);
    await control("Undo transfer").click();
    assert.deepEqual(await labels(), ["school!", "Classes"]);
    assert.equal((await app.db("sessions/santi/older")).activeEdit, 0);
    assert.equal(await control("Undo transfer").isVisible(), false);
    await control("Done editing categories").click();
    assert.equal(await control("Transfer time from school!").count(), 0);
  });

  it("transfers column time with tasks, preserves notes, and retries a failed batch without partial time changes", async () => {
    const links = { school: { columnId: "reading", taskId: "paper", note: "Notes stay private." },
      older: { columnId: "reading" } };
    await open({ ...seedDb, progress: { santi: { board, links } } });
    await transfer("Reading", "category:classes");
    assert.match(await dialog().innerText(), /clears these sessions’ task assignments/);
    await dialog().getByLabel("Move time to").selectOption("column:classes");
    assert.equal(await app.page.locator("#categoryEditImpact").isVisible(), false);
    await app.page.evaluate(() => window.__fakeDb.failSessionTransactions());
    await control("Transfer time", dialog()).click();
    assert.match(await dialog().getByRole("alert").innerText(), /Simulated session permission failure/);
    assert.deepEqual(await app.db("sessions/santi"), seedDb.sessions.santi);
    await control("Transfer time", dialog()).click();
    await dialog().waitFor({ state: "hidden" });
    const destination = app.page.locator('#breakdownRows [data-column-id="classes"]');
    assert.equal(await control("Rename Classes (Progress column)").count(), 1);
    assert.equal(await control("Rename Classes (Standalone category)").count(), 1);
    await destination.locator("summary").click();
    assert.match(await destination.innerText(), /Read paper\s+15m/);
    const log = await app.db("sessions/santi");
    assert.doesNotMatch(JSON.stringify(log), /taskId|columnId|Notes stay private/);
    assert.equal(await app.db("progress/santi/links/school/note"), links.school.note);
    await control("Undo transfer").click();
    assert.equal(await app.page.locator('#breakdownRows [data-column-id="reading"]').count(), 1);
    assert.equal(await app.page.locator('#breakdownRows [data-column-id="classes"]').count(), 0);
    await control("Rename Reading").click();
    await dialog().getByLabel("Name", { exact: true }).fill("Papers");
    await control("Save name", dialog()).click();
    await dialog().waitFor({ state: "hidden" });
    assert.equal((await app.db("progress/santi/board/columns/reading")).title, "Papers");
    assert.deepEqual(await labels(), ["Classes", "Papers"]);

    await transfer("Papers", "category:classes");
    await control("Transfer time", dialog()).click();
    await dialog().waitFor({ state: "hidden" });
    assert.deepEqual(await labels(), ["Classes"]);
    assert.equal(await app.db("progress/santi/links/school/note"), links.school.note);
    await control("Undo transfer").click();
    const restored = app.page.locator('#breakdownRows [data-column-id="reading"]');
    await restored.locator("summary").click();
    assert.match(await restored.innerText(), /Read paper\s+15m/);
  });
});
