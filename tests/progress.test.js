import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { openApp, setup, teardown, T0, MIN } from "./helpers/harness.js";

const boardPath = "progress/santi/board";
const linksPath = "progress/santi/links";
const activeColumn = (title, position = 0) => ({ title, status: "active", position });
const basicBoard = {
  columns: { research: activeColumn("Research"), writing: activeColumn("Writing", 1) },
  tasks: { read: { title: "Read paper", columnId: "research", position: 0 } },
};
const seeded = { progress: { santi: { board: basicBoard } } };

let app;
before(setup);
after(teardown);
afterEach(async () => {
  await app?.close();
  app = null;
});

function control(name, root = app.page) {
  return root.getByRole("button", { name, exact: true });
}
function column(name) {
  return app.page.getByRole("region", { name, exact: true });
}
function dialog() {
  return app.page.getByRole("dialog");
}
function waitForText(selector, text) {
  return app.page.waitForFunction(([css, expected]) =>
    document.querySelector(css)?.textContent.includes(expected), [selector, text]);
}
async function reload() {
  await app.page.reload();
  await app.run(100);
}
async function addColumn(title, color) {
  await app.click("showAddColumn");
  await app.page.getByLabel("Column title").fill(title);
  assert.doesNotMatch(await app.page.locator("#addColumn").innerText(), /\bnull\b/);
  if (color) await app.page.locator("#addColumn").getByText(color, { exact: true }).click();
  await control("Add column").click();
  await column(title).waitFor();
  assert.equal(await app.page.locator("#addColumn").isVisible(), false);
}
async function addTask(columnName, title) {
  await control("Add task to " + columnName).click();
  await app.page.getByLabel("Task title in " + columnName).fill(title);
  await control("Add", column(columnName)).click();
  await control(title, column(columnName)).waitFor();
}
async function openFocus() {
  await app.click("openFocusPicker");
}
function focusSearch() {
  return app.page.getByRole("searchbox", { name: "Find a focus choice" });
}
async function pickFocus(text, name) {
  await openFocus();
  await focusSearch().fill(text);
  await control(name).click();
}
async function openLatestSessionNote() {
  if (await app.page.locator("#dashboardNav").isVisible()) await app.click("dashboardNav");
  const manager = app.page.locator("#timeManager");
  if (!await manager.evaluate((details) => details.open)) {
    await manager.getByText("Manage logged time", { exact: true }).click();
  }
  const latest = manager.locator(".time-history-row").first();
  await control("Session note", latest).click();
}
async function closeDetails() {
  await control("Close details", dialog()).click();
}

describe("personal Progress board", () => {
  it("creates columns and tasks, edits their details, and persists ordering after refresh", async () => {
    app = await openApp();
    await app.click("progressNav");
    await addColumn("Research");
    await addColumn("Writing", "Teal");
    assert.equal(await column("Writing").getAttribute("data-color"), "teal");
    await addTask("Research", "Read paper");
    await addTask("Writing", "Outline");
    await control("Column options for Research").click();
    assert.doesNotMatch(await dialog().innerText(), /\bnull\b/);
    await dialog().getByLabel("Name", { exact: true }).fill("AI Research");
    await dialog().getByLabel("Description").fill("Keep track of reading.");
    await dialog().getByText("Sage", { exact: true }).click();
    await control("Save column", dialog()).click();
    await dialog().waitFor({ state: "hidden" });
    await control("Column options for AI Research").click();
    await control("Move right", dialog()).click();
    await closeDetails();
    await control("Read paper").click();
    await dialog().getByLabel("Title").fill("Read Lenia paper");
    await dialog().getByLabel("Description").fill("Read the methods section.");
    await dialog().getByLabel("Notes", { exact: true }).fill("Check the figures.");
    await dialog().getByLabel("Due date").fill("2026-10-04");
    await dialog().getByLabel("Column", { exact: true }).selectOption({ label: "Writing" });
    await control("Save task", dialog()).click();
    await control("Move up", dialog()).click();
    await closeDetails();
    await reload();
    assert.deepEqual(await app.page.locator(".progress-column h2").allTextContents(), ["Writing", "AI Research"]);
    assert.equal(await column("AI Research").getAttribute("data-color"), "sage");
    assert.match(await column("AI Research").textContent(), /Keep track of reading/);
    assert.deepEqual(await column("Writing").locator(".progress-task-title").allTextContents(),
      ["Read Lenia paper", "Outline"]);
    await control("Read Lenia paper").click();
    assert.equal(await dialog().getByLabel("Notes", { exact: true }).inputValue(), "Check the figures.");
    assert.equal(await dialog().getByLabel("Due date").inputValue(), "2026-10-04");
    assert.deepEqual(app.errors, []);
  });

  it("drags a task across columns and restores archived columns and trashed tasks", async () => {
    app = await openApp({ seedDb: seeded });
    await app.click("progressNav");
    await column("Research").locator(".progress-task").dragTo(column("Writing").getByRole("heading"));
    await control("Read paper", column("Writing")).waitFor();
    assert.equal((await app.db(boardPath)).tasks.read.columnId, "writing");

    await control("Column options for Writing").click();
    await control("Archive column", dialog()).click();
    await column("Writing").waitFor({ state: "hidden" });
    await control("Archive & Trash").click();
    await control("Writing", dialog()).click();
    await control("Restore column", dialog()).click();
    await control("Read paper", column("Writing")).click();
    app.page.once("dialog", (prompt) => prompt.dismiss());
    await control("Move task to Trash", dialog()).click();
    assert.equal((await app.db(boardPath)).tasks.read.deletedAt, undefined);
    app.page.once("dialog", (prompt) => prompt.accept());
    await control("Move task to Trash", dialog()).click();
    await dialog().waitFor({ state: "hidden" });
    assert.ok((await app.db(boardPath)).tasks.read.deletedAt);
    await control("Archive & Trash").click();
    await control("Read paper", dialog()).click();
    await control("Restore task", dialog()).click();
    await control("Read paper", column("Writing")).waitFor();

    await control("Column options for Writing").click();
    app.page.once("dialog", (prompt) => prompt.accept());
    await control("Move column to Trash", dialog()).click();
    await column("Writing").waitFor({ state: "hidden" });
    assert.equal((await app.db(boardPath)).tasks.read.columnId, "writing");
    await control("Archive & Trash").click();
    await control("Writing", dialog()).click();
    await control("Restore column", dialog()).click();
    await control("Read paper", column("Writing")).waitFor();
    assert.deepEqual(app.errors, []);
  });

  it("uses each role's own board and keeps the phone timer read-only", async () => {
    app = await openApp({
      role: "kristina", device: "phone",
      seedDb: { progress: { ...seeded.progress, kristina: {
        board: { columns: { projects: activeColumn("Personal projects"), exercise: activeColumn("Exercise", 1) } },
      } } },
    });
    await app.page.setViewportSize({ width: 390, height: 844 });
    await app.click("progressNav");
    await column("Personal projects").waitFor();
    assert.equal(await column("Research").count(), 0);
    await addTask("Personal projects", "Sketch");
    assert.equal(await control("Focus on Sketch").count(), 0);
    assert.equal(Object.keys((await app.db(boardPath)).tasks).length, 1);
    const [scroll, viewport] = await app.page.locator("#progressTrack")
      .evaluate((element) => [element.scrollWidth, element.clientWidth]);
    assert.ok(scroll > viewport, "the board scrolls horizontally");
    assert.equal(await app.page.evaluate(() => document.documentElement.scrollWidth), 390);
    await app.page.getByRole("link", { name: "← Timer" }).click();
    assert.equal(await app.page.locator("#startBtn").isVisible(), false);
    assert.equal(await app.page.locator("#dashboardNav").isVisible(), false);
    assert.deepEqual(app.errors, []);
  });

  it("fails closed on denied Progress access and can still log an unassigned run", async () => {
    app = await openApp({ denyProgress: true, seedDb: seeded });
    await app.click("progressNav");
    await waitForText("#progressStatus", "This browser needs access");
    assert.equal(await column("Research").count(), 0);
    await app.page.getByRole("link", { name: "← Timer" }).click();
    await openFocus();
    await focusSearch().fill("Read paper");
    assert.equal(await control("Read paper Task · Research").count(), 0);
    await control("Close focus picker").click();
    await app.click("startBtn");
    await app.run(8_000);
    await app.click("resetBtn");
    assert.equal((await app.sessions()).length, 1);
    assert.equal(await app.db(linksPath), null);
    assert.deepEqual(app.errors, []);
  });
});

describe("Progress timer attribution", () => {
  it("remembers the two latest choices across reloads and keeps task names out of presence", async () => {
    app = await openApp({ seedDb: seeded });
    await pickFocus("Writing", "Writing Column");
    await pickFocus("Reading", "Use “Reading” as category");
    await pickFocus("Read paper", "Read paper Task · Research");
    await reload();
    assert.equal(await app.text("focusChoice"), "Read paper");
    await openFocus();
    const recent = app.page.getByRole("group", { name: "Recent choices" });
    const choices = await recent.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.dataset.choice));
    assert.deepEqual(choices, ["task:read", "category:reading"]);
    await control("Category · Reading").click();
    await control("Clear category").click();
    assert.equal(await app.text("focusChoice"), "Read paper");
    await app.click("startBtn");
    const room = await app.db("room/santi");
    assert.equal(room.running, true);
    assert.equal(room.category, undefined);
    assert.doesNotMatch(JSON.stringify(room), /Read paper|taskId|columnId/);
    assert.deepEqual(app.errors, []);
  });

  it("preserves active time, blocks switching, and retains history when moved, completed or restored", async () => {
    app = await openApp({ seedDb: seeded });
    await app.click("progressNav");
    await control("Focus on Read paper").click();
    assert.equal(await app.text("focusChoice"), "Read paper");
    await openFocus();
    await control("Add category").click();
    await focusSearch().fill("Study");
    await focusSearch().press("Enter");
    assert.equal(await app.text("focusChoice"), "Read paper");
    await app.click("startBtn");
    await app.run(45_000);
    await app.click("pauseBtn");
    await app.run(25_000);
    await openFocus();
    assert.equal(await focusSearch().isVisible(), false);
    assert.match(await app.text("focusPickerHint"), /Reset to end this session/);
    await control("Close focus picker").click();
    await app.click("progressNav");
    await control("Column options for Writing").click();
    await control("Focus on this column", dialog()).click();
    assert.match(await dialog().locator("#progressDialogError").textContent(), /Reset the timer/);
    await closeDetails();

    await control("Read paper").click();
    await dialog().getByLabel("Column", { exact: true }).selectOption({ label: "Writing" });
    await control("Save task", dialog()).click();
    await closeDetails();
    await control("Focus on Read paper").click();
    assert.equal(await app.text("focusChoice"), "Read paper");
    await app.click("startBtn");
    await app.run(45_000);
    await reload();
    await app.click("resetBtn");

    await openLatestSessionNote();
    await dialog().getByLabel("Session note").fill("Worked through the examples.");
    await control("Save note", dialog()).click();
    await openLatestSessionNote();
    await control("Mark task complete", dialog()).click();
    await closeDetails();
    const [sessionId, logged] = Object.entries(await app.db("sessions/santi"))[0];
    assert.equal(logged.elapsedSeconds, 90);
    assert.equal(logged.categoryKey, "study");
    assert.equal(logged.taskId, undefined);
    assert.equal(logged.columnId, undefined);
    assert.equal(logged.note, undefined);
    assert.deepEqual(await app.db(linksPath + "/" + sessionId), {
      taskId: "read", columnId: "research", note: "Worked through the examples.",
    });
    assert.equal((await app.sessions()).length, 1);
    assert.equal(await app.text("focusChoice"), "Study");

    await app.page.locator("#dashboardView").getByRole("link", { name: "Progress" }).click();
    assert.match(await column("Research").textContent(), /Total 1m 30s · This week 1m 30s/);
    assert.match(await column("Writing").textContent(), /Total 0m · This week 0m/);
    assert.equal(await control("Read paper").isVisible(), false);
    await column("Writing").getByText("Completed (1)", { exact: true }).click();
    await control("Read paper").click();
    assert.match(await dialog().textContent(), /Completed.*1m 30s.*1 session/);
    assert.match(await dialog().textContent(), /Worked through the examples/);
    await control("Restore to active", dialog()).click();
    await closeDetails();
    assert.ok(await control("Read paper", column("Writing")).isVisible());
    assert.equal((await app.sessions()).length, 1);
    assert.deepEqual(app.errors, []);
  });

  it("records column-only and unassigned runs and computes weekly totals at the Monday boundary", async () => {
    const monday = new Date("2026-09-28T00:00:00-04:00").getTime();
    app = await openApp({ seedDb: {
      progress: { santi: { board: basicBoard, links: {
        previous: { columnId: "research", taskId: "read" },
        boundary: { columnId: "research" },
        removed: { columnId: "research" },
      } } },
      sessions: { santi: {
        previous: { endedAt: monday - 1, elapsedSeconds: 3600 },
        boundary: { endedAt: monday, elapsedSeconds: 600 },
        removed: { endedAt: T0, elapsedSeconds: 3600, removed: true },
      } },
    } });
    await pickFocus("Research", "Research Column");
    await app.setDuration(1);
    await app.click("startBtn");
    await app.run(MIN + 250);
    assert.equal(await app.text("focusChoice"), "Research");
    await openFocus();
    await control("Clear selection").click();
    await app.click("startBtn");
    await app.run(MIN + 250);
    await app.click("resetBtn");
    await app.click("progressNav");
    assert.match(await column("Research").textContent(), /Total 1h 11m · This week 11m/);
    assert.equal((await app.sessions()).length, 5);
    assert.equal(Object.keys(await app.db(linksPath)).length, 4);
    await app.page.getByRole("link", { name: "← Timer" }).click();
    await app.page.locator("#timerView").waitFor({ state: "visible" });
    await openLatestSessionNote();
    await dialog().getByLabel("Session note").fill("Unassigned work.");
    await control("Save note", dialog()).click();
    const noteOnly = Object.values(await app.db(linksPath)).find((link) => link.note === "Unassigned work.");
    assert.deepEqual(noteOnly, { note: "Unassigned work." });
    await app.page.locator("#dashboardView").getByRole("link", { name: "Progress" }).click();
    await control("Column options for Research").click();
    assert.match(await dialog().textContent(), /Column-only sessions/);
    assert.equal(await dialog().locator(".progress-dialog-list li").count(), 2);
    assert.deepEqual(app.errors, []);
  });

  it("retries a failed private link after refresh without duplicating or overwriting the session", async () => {
    app = await openApp({ seedDb: seeded });
    await pickFocus("Read paper", "Read paper Task · Research");
    await app.page.evaluate(() => window.__fakeDb.failProgressLinks());
    await app.click("startBtn");
    await app.run(10_000);
    await app.click("resetBtn");
    await waitForText("#sessionSync", "waiting to sync");
    const original = await app.db("sessions/santi");
    assert.equal(Object.keys(original).length, 1);
    assert.equal(await app.db(linksPath), null);
    await reload();
    await app.page.waitForFunction((path) => !!window.__fakeDb.get(path), linksPath);
    assert.deepEqual(await app.db("sessions/santi"), original);
    assert.equal(Object.keys(await app.db(linksPath)).length, 1);
    assert.equal(await app.page.evaluate(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("pendingFocus:")).length), 0);
    assert.deepEqual(app.errors, []);
  });

  it("recovers both sides of a pause in an interrupted targeted run", async () => {
    const startedAt = T0 - 40_000;
    app = await openApp({
      seedDb: seeded,
      seedStorage: { "timerData:santi": JSON.stringify({
        running: true, startedAt, lastTickAt: startedAt + 10_000,
        duration: 120_000, countdownDuration: 120_000, remainingAtStart: 90_000,
        runId: "paused-recovery", focusTarget: { uid: "uid-test-santi", columnId: "research", taskId: "read" },
      }) },
    });
    await app.page.waitForFunction((path) => !!window.__fakeDb.get(path), linksPath + "/paused-recovery");
    assert.equal((await app.sessions())[0].elapsedSeconds, 40);
    assert.equal((await app.db(linksPath))["paused-recovery"].taskId, "read");
    await reload();
    assert.equal((await app.sessions()).length, 1);
    assert.deepEqual(app.errors, []);
  });

  it("finishes a run after task completion and updates an open history without clearing edits", async () => {
    app = await openApp({ seedDb: seeded });
    await pickFocus("Read paper", "Read paper Task · Research");
    await app.setDuration(1);
    await app.click("startBtn");
    await app.click("progressNav");
    await control("Complete Read paper").click();
    await column("Research").getByText("Completed (1)", { exact: true }).click();
    await control("Read paper").click();
    await dialog().getByLabel("Notes", { exact: true }).fill("An unsaved note");
    await app.run(MIN + 250);
    assert.match(await dialog().textContent(), /Completed.*1m.*1 session/);
    assert.equal(await dialog().getByLabel("Notes", { exact: true }).inputValue(), "An unsaved note");
    assert.equal((await app.sessions())[0].elapsedSeconds, 60);
    assert.deepEqual(app.errors, []);
  });
});
