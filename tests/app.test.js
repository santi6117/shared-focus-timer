// Behaviour tests for the whole app, run in headless Chromium against the
// real page with Firebase replaced by an in-memory fake (helpers/).
//
// These are written against what a person sees and what gets written to the
// database — element text, classes, database paths — never against internal
// function names, so they survive any reorganisation of the code.
//
// Every scenario that earlier sessions verified by hand-built throwaway
// harnesses lives here now, so it is re-checked on every change.

import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setup, teardown, openApp, T0, MIN } from "./helpers/harness.js";

before(setup);
after(teardown);

let app;
afterEach(async () => {
  if (app) {
    const errors = app.errors.map(String);
    await app.close();
    app = null;
    assert.deepEqual(errors, [], "page threw an uncaught error");
  }
});

const timerState = (overrides) =>
  JSON.stringify({
    duration: 45 * MIN, remainingAtStart: 45 * MIN, startedAt: null, running: false,
    logged: false, zeroAt: null, categoryLabel: "", lastTickAt: null, ...overrides,
  });

// ---------------------------------------------------------------- boot

describe("boot and identity", () => {
  it("asks for a role when none is set", async () => {
    app = await openApp({ role: null });
    const body = await app.page.locator("body").textContent();
    assert.match(body, /\?me=santi/);
    app.errors.length = 0; // the thrown "No role set" is the intended stop
  });

  it("renders for santi, facing kristina", async () => {
    app = await openApp();
    assert.equal(await app.text("timerDisplay"), "25:00");
    assert.equal(await app.text("stageLabel"), "Focus");
    assert.equal(await app.text("presenceName"), "Kristina");
    assert.equal(await app.text("presenceState"), "not working");
    assert.equal(await app.text("composeTo"), "Kristina");
    assert.match(await app.text("uidDebug"), /santi · uid /);
  });

  it("remembers the role without the query string", async () => {
    app = await openApp({ role: "kristina" });
    await app.page.goto(app.page.url().split("?")[0]);
    await app.run(50);
    assert.equal(await app.text("presenceName"), "Santi");
  });

  it("registers the disconnect handler for its own slot", async () => {
    app = await openApp();
    const w = (await app.writes()).find((x) => x.op === "onDisconnect.update");
    assert.deepEqual(w, { op: "onDisconnect.update", path: "room/santi", value: { running: false } });
  });
});

// ---------------------------------------------------------------- timer

describe("timer", () => {
  it("counts down, pauses and resumes, publishing what is left", async () => {
    app = await openApp();
    await app.click("startBtn");
    await app.run(250); // the display re-renders on a 250ms loop
    assert.equal(await app.text("stageLabel"), "Focusing");
    assert.equal(await app.page.locator("#durationInput").isDisabled(), true);
    let room = await app.db("room/santi");
    assert.equal(room.running, true);
    assert.equal(room.remainingAtStart, 1500);
    assert.equal(typeof room.startedAt, "number");

    await app.run(MIN - 250);
    assert.equal(await app.text("timerDisplay"), "24:00");

    await app.click("pauseBtn");
    await app.run(3 * MIN);
    assert.equal(await app.text("timerDisplay"), "24:00");
    assert.equal(await app.text("stageLabel"), "Focus");
    assert.equal((await app.db("room/santi")).running, false);

    await app.click("startBtn");
    room = await app.db("room/santi");
    assert.equal(room.remainingAtStart, 1440, "resume publishes time left, not the full duration");
    assert.deepEqual(await app.sessions(), [], "pausing logs nothing");
  });

  it("ends at zero: stops, logs once, counts up, restarts cleanly", async () => {
    app = await openApp();
    await app.setDuration(1);
    await app.click("startBtn");
    await app.run(MIN + 2000);

    assert.match(await app.text("timerDisplay"), /^\+0:0[12]$/);
    assert.equal(await app.has("timerDisplay", "overrun"), true);
    assert.equal(await app.text("stageLabel"), "Done");
    assert.equal((await app.db("room/santi")).running, false);
    let s = await app.sessions();
    assert.equal(s.length, 1);
    assert.equal(s[0].elapsedSeconds, 60);
    assert.equal(s[0].categoryKey, "uncategorized");

    await app.run(10_000);
    await app.click("resetBtn");
    await app.run(250);
    assert.equal((await app.sessions()).length, 1, "reset after zero must not double-log");
    assert.equal(await app.text("timerDisplay"), "1:00");

    await app.click("startBtn");
    await app.run(MIN + 1000);
    await app.click("startBtn"); // straight out of the count-up
    await app.run(1000);
    assert.equal((await app.sessions()).length, 2);
    assert.equal(await app.text("stageLabel"), "Focusing");
    assert.equal(await app.text("timerDisplay"), "0:59");
  });

  it("logs real elapsed time on reset, and ignores a misclick", async () => {
    app = await openApp();
    await app.click("startBtn");
    await app.run(90_000);
    await app.click("resetBtn");
    assert.deepEqual((await app.sessions()).map((s) => s.elapsedSeconds), [90]);
    await app.run(250);
    assert.equal(await app.text("timerDisplay"), "25:00");

    await app.click("startBtn");
    await app.run(3000);
    await app.click("resetBtn");
    assert.equal((await app.sessions()).length, 1, "a 3s run is below the noise floor");
  });

  it("changing the duration while paused logs the pending time first", async () => {
    app = await openApp();
    await app.click("startBtn");
    await app.run(2 * MIN);
    await app.click("pauseBtn");
    await app.setDuration(10);
    assert.deepEqual((await app.sessions()).map((s) => s.elapsedSeconds), [120]);
    await app.run(300);
    assert.equal(await app.text("timerDisplay"), "10:00");
  });

  it("survives a refresh mid-session without logging", async () => {
    app = await openApp();
    await app.click("startBtn");
    await app.run(2 * MIN);
    await app.page.reload();
    await app.run(300);
    assert.equal(await app.text("stageLabel"), "Focusing");
    assert.match(await app.text("timerDisplay"), /^2[23]:5\d$|^23:00$/);
    assert.deepEqual(await app.sessions(), []);
  });
});

// ---------------------------------------------------------------- recovery

describe("recovery from a crash or reboot", () => {
  const seedTimer = (t) => ({ "timerData:santi": timerState(t), myRole: "santi" });

  it("died 10 min into a 45-min run, reopened 3h later: logs 600s", async () => {
    const startedAt = T0 - 3 * 60 * MIN - 10 * MIN;
    app = await openApp({ seedStorage: seedTimer({ running: true, startedAt, lastTickAt: startedAt + 10 * MIN }) });
    await app.run(300);
    assert.deepEqual((await app.sessions()).map((s) => s.elapsedSeconds), [600]);
    assert.equal(await app.text("timerDisplay"), "45:00");
    assert.equal(await app.text("stageLabel"), "Focus");
    assert.equal(await app.page.locator("#durationInput").isDisabled(), false);
    await app.click("startBtn");
    await app.run(250);
    assert.equal(await app.text("stageLabel"), "Focusing", "controls still work");
  });

  it("died past zero: capped at the full duration", async () => {
    const startedAt = T0 - 5 * 60 * MIN;
    app = await openApp({ seedStorage: seedTimer({ running: true, startedAt, lastTickAt: startedAt + 3 * 60 * MIN }) });
    await app.run(300);
    assert.deepEqual((await app.sessions()).map((s) => s.elapsedSeconds), [2700]);
  });

  it("ordinary refresh (fresh heartbeat): resumes, logs nothing", async () => {
    app = await openApp({ seedStorage: seedTimer({ running: true, startedAt: T0 - 2 * MIN, lastTickAt: T0 - 3000 }) });
    await app.run(300);
    assert.equal(await app.text("stageLabel"), "Focusing");
    assert.equal(await app.text("timerDisplay"), "42:59");
    assert.deepEqual(await app.sessions(), []);
  });

  it("legacy state with no heartbeat: resets cleanly, logs nothing", async () => {
    app = await openApp({ seedStorage: seedTimer({ running: true, startedAt: T0 - 3 * 60 * MIN }) });
    await app.run(6000);
    assert.equal(await app.text("stageLabel"), "Focus");
    assert.deepEqual(await app.sessions(), []);
  });

  it("crashed 3s in: below the noise floor", async () => {
    const startedAt = T0 - 60 * MIN;
    app = await openApp({ seedStorage: seedTimer({ running: true, startedAt, lastTickAt: startedAt + 3000 }) });
    await app.run(6000);
    assert.deepEqual(await app.sessions(), []);
  });

  it("clean idle state is untouched", async () => {
    app = await openApp({ seedStorage: seedTimer({ remainingAtStart: 30 * MIN }) });
    await app.run(6000);
    assert.equal(await app.text("timerDisplay"), "30:00");
    assert.deepEqual(await app.sessions(), []);
  });

  it("a recovered session keeps the established category's label and colour", async () => {
    const startedAt = T0 - 60 * MIN;
    app = await openApp({
      seedStorage: seedTimer({ running: true, startedAt, lastTickAt: startedAt + 20 * MIN, categoryLabel: "thesis" }),
      seedDb: { categories: { santi: { thesis: { label: "Thesis", color: "#6b8ca8", lastUsedAt: 1 } } } },
    });
    await app.run(300);
    const s = await app.sessions();
    assert.equal(s.length, 1);
    assert.equal(s[0].categoryKey, "thesis");
    const cat = await app.db("categories/santi/thesis");
    assert.equal(cat.label, "Thesis");
    assert.equal(cat.color, "#6b8ca8");
  });
});

// ---------------------------------------------------------------- stopwatch

describe("stopwatch", () => {
  const HOUR = 60 * MIN;
  const notifications = () => app.page.evaluate(() => window.__notifications);

  it("counts up, pauses, resumes, and logs real elapsed time on reset", async () => {
    app = await openApp();
    await app.click("modeToggle");
    await app.run(250);
    assert.equal(await app.text("modeToggle"), "\u2191 Stopwatch");
    assert.equal(await app.text("timerDisplay"), "0:00");
    assert.equal(await app.page.locator("#durationInput").isVisible(), false);
    assert.equal(await app.text("capNote"), "Stops itself at 2 hours");

    await app.click("startBtn");
    await app.run(MIN + 250); // the display re-renders on a 250ms loop
    assert.equal(await app.text("timerDisplay"), "1:00");
    assert.equal(await app.page.locator("#modeToggle").isDisabled(), true, "locked while running");
    const room = await app.db("room/santi");
    assert.equal(room.mode, "stopwatch");
    assert.equal(room.running, true);

    await app.click("pauseBtn");
    await app.run(5 * MIN);
    assert.equal(await app.text("timerDisplay"), "1:00");
    await app.click("startBtn");
    await app.run(HOUR);
    assert.equal(await app.text("timerDisplay"), "1:01:00");

    await app.click("resetBtn");
    await app.run(250);
    assert.deepEqual((await app.sessions()).map((s) => s.elapsedSeconds), [61 * 60]);
    assert.equal(await app.text("timerDisplay"), "0:00");
  });

  it("stops itself at two hours, logs two hours once, and alerts", async () => {
    app = await openApp();
    await app.page.locator("#categoryInput").fill("Thesis");
    await app.click("modeToggle");
    await app.click("startBtn");
    await app.run(2 * HOUR + 30_000);

    assert.equal(await app.text("timerDisplay"), "2:00:00", "holds at the cap");
    assert.equal(await app.has("timerDisplay", "overrun"), true);
    assert.equal(await app.text("stageLabel"), "Done");
    assert.equal((await app.db("room/santi")).running, false);
    assert.deepEqual((await app.sessions()).map((s) => s.elapsedSeconds), [7200]);

    const n = await notifications();
    assert.equal(n.length, 1);
    assert.equal(n[0].title, "2 hours up");
    assert.match(n[0].body, /2-hour limit \(Thesis\)/);
    assert.equal((await app.page.evaluate(() => window.__tones)).length, 2);

    await app.click("resetBtn");
    assert.equal((await app.sessions()).length, 1, "reset after the cap must not double-log");
    await app.click("startBtn"); // a fresh run from zero
    await app.run(10_250);
    assert.equal(await app.text("timerDisplay"), "0:10");
  });

  it("switching mode while paused logs the pending time and restores the minutes", async () => {
    app = await openApp({ seedStorage: { "timerData:santi": timerState({}) } });
    await app.click("startBtn");
    await app.run(10 * MIN);
    await app.click("pauseBtn");
    await app.click("modeToggle");
    assert.deepEqual((await app.sessions()).map((s) => s.elapsedSeconds), [600]);
    await app.run(250);
    assert.equal(await app.text("timerDisplay"), "0:00");

    await app.click("modeToggle");
    await app.run(250);
    assert.equal(await app.text("modeToggle"), "\u2193 Countdown");
    assert.equal(await app.text("timerDisplay"), "45:00", "the countdown length survives");
    assert.equal(await app.page.locator("#durationInput").inputValue(), "45");
    assert.equal((await app.sessions()).length, 1);
  });

  it("survives a refresh mid-run", async () => {
    app = await openApp();
    await app.click("modeToggle");
    await app.click("startBtn");
    await app.run(3 * MIN);
    await app.page.reload();
    await app.run(250);
    assert.equal(await app.text("modeToggle"), "\u2191 Stopwatch");
    assert.equal(await app.text("timerDisplay"), "3:00");
    assert.equal(await app.text("stageLabel"), "Focusing");
  });

  it("the other person's pill and your phone count up", async () => {
    app = await openApp();
    const now = await app.now();
    await app.remote("room/kristina", {
      running: true, mode: "stopwatch", startedAt: now - HOUR - 5000, remainingAtStart: 7200, category: "Essay",
    });
    await app.run(300);
    assert.equal(await app.text("presenceState"), "focusing on Essay · 1:00:05 \u2191");
    await app.close();

    app = await openApp({
      device: "phone",
      seedDb: { room: { santi: { running: true, mode: "stopwatch", startedAt: T0 - 90_000, remainingAtStart: 7200 } } },
    });
    await app.run(250);
    assert.equal(await app.text("timerDisplay"), "1:30");
  });
});

// ---------------------------------------------------------------- categories

describe("categories", () => {
  async function typeCategory(text) {
    await app.page.locator("#categoryInput").fill(text);
    await app.page.locator("#categoryInput").blur();
  }

  it("a session logs under its category and creates the vocabulary entry", async () => {
    app = await openApp();
    await typeCategory("Thesis");
    await app.click("startBtn");
    await app.run(MIN);
    await app.click("resetBtn");
    const s = await app.sessions();
    assert.equal(s[0].categoryKey, "thesis");
    const cat = await app.db("categories/santi/thesis");
    assert.equal(cat.label, "Thesis");
    assert.equal(cat.color, "#c1714a");
  });

  it("a typed variant snaps to the established spelling", async () => {
    app = await openApp({ seedDb: { categories: { santi: { thesis: { label: "Thesis", color: "#c1714a", lastUsedAt: 1 } } } } });
    await typeCategory("THESIS  ");
    assert.equal(await app.page.locator("#categoryInput").inputValue(), "Thesis");
  });

  it("chips appear from the second category, most recent first, and set the input", async () => {
    app = await openApp({ seedDb: { categories: { santi: {
      thesis: { label: "Thesis", color: "#c1714a", lastUsedAt: 1 },
    } } } });
    assert.equal(await app.has("categoryChips", "visible"), false);
    await app.remote("categories/santi/tutoring", { label: "Tutoring", color: "#7a9a6e", lastUsedAt: 2 });
    assert.equal(await app.has("categoryChips", "visible"), true);
    const chips = await app.page.locator("#categoryChips .cat-chip").allTextContents();
    assert.deepEqual(chips, ["Tutoring", "Thesis"]);
    await app.page.locator("#categoryChips .cat-chip", { hasText: "Thesis" }).click();
    assert.equal(await app.page.locator("#categoryInput").inputValue(), "Thesis");
  });

  it("changing category mid-session updates presence without restarting it", async () => {
    app = await openApp();
    await app.click("startBtn");
    const before = await app.db("room/santi");
    await app.run(MIN);
    await typeCategory("Reading");
    const room = await app.db("room/santi");
    assert.equal(room.category, "Reading");
    assert.equal(room.startedAt, before.startedAt);
  });
});

// ---------------------------------------------------------------- presence

describe("presence", () => {
  it("shows the other person's live timer and category, else 'not working'", async () => {
    app = await openApp();
    const now = await app.now();
    await app.remote("room/kristina", { running: true, startedAt: now - MIN, remainingAtStart: 1500, category: "Essay" });
    await app.run(300);
    assert.equal(await app.text("presenceState"), "focusing on Essay · 23:59");
    assert.equal(await app.has("presenceDot", "live"), true);

    await app.remote("room/kristina", { running: false, startedAt: null, remainingAtStart: 1440, category: "Essay" });
    await app.run(300);
    assert.equal(await app.text("presenceState"), "not working");
    assert.equal(await app.has("presenceDot", "live"), false);
  });
});

// ---------------------------------------------------------------- stats

describe("stats and breakdown", () => {
  const monday = T0 - 2 * 24 * 60 * MIN;
  const lastWeek = T0 - 7 * 24 * 60 * MIN;
  const seedDb = {
    sessions: { santi: {
      a: { endedAt: lastWeek, elapsedSeconds: 600, categoryKey: "thesis" },
      b: { endedAt: monday, elapsedSeconds: 3600, categoryKey: "thesis" },
      c: { endedAt: monday + 1000, elapsedSeconds: 900, categoryKey: "reading" },
      d: { endedAt: T0 - 60 * MIN, elapsedSeconds: 1800, categoryKey: "tutoring" },
      e: { endedAt: T0 - 30 * MIN, elapsedSeconds: 300, categoryKey: "email" },
    } },
    categories: { santi: {
      thesis: { label: "Thesis", color: "#c1714a", lastUsedAt: 1 },
      reading: { label: "Reading", color: "#7a9a6e", lastUsedAt: 2 },
      tutoring: { label: "Tutoring", color: "#6b8ca8", lastUsedAt: 3 },
      email: { label: "Email", color: "#b08968", lastUsedAt: 4 },
    } },
  };

  it("totals today, this week (from Monday) and all time", async () => {
    app = await openApp({ seedDb });
    await app.run(300);
    assert.equal(await app.text("chipValue"), "35m");
    assert.equal(await app.text("statToday"), "35m");
    assert.equal(await app.text("statWeek"), "1h 50m");
    assert.equal(await app.text("statAll"), "2h 0m");
    assert.equal(await app.text("statCount"), "5 sessions logged");
  });

  it("breakdown shows the top three, a remainder, and cycles periods", async () => {
    app = await openApp({ seedDb });
    await app.run(300);
    assert.equal(await app.text("periodToggle"), "This week");
    assert.equal(await app.text("breakdownTop"), "Thesis");
    const rows = await app.page.locator("#breakdownRows .cat-row .name").allTextContents();
    assert.deepEqual(rows, ["Thesis", "Tutoring", "Reading"]);
    assert.equal(await app.text("breakdownMore"), "+ 1 more · 5m");
    assert.equal(await app.page.locator("#shareBar div").count(), 4);

    await app.click("breakdownChip");
    await app.click("periodToggle");
    assert.equal(await app.text("periodToggle"), "All time");
    await app.click("periodToggle");
    assert.equal(await app.text("periodToggle"), "Today");
    assert.deepEqual(await app.page.locator("#breakdownRows .cat-row .name").allTextContents(), ["Tutoring", "Email"]);
  });

  it("a finished session updates the totals live", async () => {
    app = await openApp();
    await app.click("startBtn");
    await app.run(10 * MIN);
    await app.click("resetBtn");
    assert.equal(await app.text("chipValue"), "10m");
    assert.equal(await app.text("statCount"), "1 session logged");
  });
});

// ---------------------------------------------------------------- shared today

describe("the other person's split", () => {
  const seedDb = {
    sessions: { santi: {
      a: { endedAt: T0 - 24 * 60 * MIN, elapsedSeconds: 3600, categoryKey: "thesis" },
      b: { endedAt: T0 - 60 * MIN, elapsedSeconds: 1800, categoryKey: "tutoring" },
      c: { endedAt: T0 - 30 * MIN, elapsedSeconds: 600, categoryKey: "thesis" },
    } },
    categories: { santi: {
      thesis: { label: "Thesis", color: "#c1714a", lastUsedAt: 1 },
      tutoring: { label: "Tutoring", color: "#6b8ca8", lastUsedAt: 2 },
    } },
    room: { santi: { running: false, startedAt: null, remainingAtStart: 2700, status: { text: "eating", setAt: 1 } } },
  };
  const hers = (until) => ({
    until, seconds: 4200, restCount: 2, restSeconds: 600,
    top: [
      { label: "Essay", color: "#9a7aa0", seconds: 2400 },
      { label: "Reading", color: "#7a9a6e", seconds: 1200 },
    ],
  });

  it("publishes my today, labelled, beside the timer and status", async () => {
    app = await openApp({ seedDb });
    await app.run(1500);
    const today = await app.db("room/santi/today");
    assert.equal(today.seconds, 2400);
    assert.deepEqual(Object.values(today.top), [
      { label: "Tutoring", color: "#6b8ca8", seconds: 1800 },
      { label: "Thesis", color: "#c1714a", seconds: 600 },
    ]);
    assert.equal(today.until, await app.page.evaluate(() => new Date(2026, 9, 1).getTime()));
    assert.equal((await app.db("room/santi/status")).text, "eating");
    // One write for the whole load burst, not one per record.
    const writes = (await app.writes()).filter((w) => w.path === "room/santi/today");
    assert.equal(writes.length, 1);

    await app.click("startBtn");
    await app.run(5 * MIN);
    await app.click("resetBtn");
    await app.run(1500);
    assert.equal((await app.db("room/santi/today")).seconds, 2700);
  });

  it("flips the split to theirs, today only, and back", async () => {
    app = await openApp({ seedDb });
    await app.remote("room/kristina/today", hers(T0 + 60 * MIN));
    await app.run(300);
    await app.click("breakdownChip");
    assert.equal(await app.text("whoseToggle"), "You");

    await app.click("whoseToggle");
    assert.equal(await app.text("whoseToggle"), "Kristina");
    assert.equal(await app.text("breakdownLabel"), "Kristina");
    assert.equal(await app.text("breakdownTop"), "Essay");
    assert.equal(await app.text("periodToggle"), "Today");
    assert.equal(await app.page.locator("#periodToggle").isDisabled(), true);
    assert.deepEqual(await app.page.locator("#breakdownRows .cat-row .name").allTextContents(), ["Essay", "Reading"]);
    assert.equal(await app.text("breakdownMore"), "+ 2 more · 10m");
    assert.equal(await app.page.locator("#shareBar div").count(), 3);

    await app.click("whoseToggle");
    assert.equal(await app.text("periodToggle"), "This week");
    assert.equal(await app.text("breakdownTop"), "Thesis");
    assert.equal(await app.page.locator("#periodToggle").isDisabled(), false);
  });

  it("their summary expires at their midnight, and is empty when missing", async () => {
    app = await openApp({ seedDb });
    await app.run(300);
    await app.click("breakdownChip");
    await app.click("whoseToggle");
    assert.equal(await app.text("breakdownMore"), "Kristina hasn't logged anything today");

    await app.remote("room/kristina/today", hers(T0 + 2 * MIN));
    await app.run(300);
    assert.equal(await app.text("breakdownTop"), "Essay");
    await app.run(3 * MIN);
    assert.equal(await app.text("breakdownTop"), "—");
    assert.equal(await app.text("breakdownMore"), "Kristina hasn't logged anything today");
  });

  it("the phone publishes nothing", async () => {
    app = await openApp({ seedDb, device: "phone" });
    await app.run(3000);
    assert.equal(await app.db("room/santi/today"), null);
  });
});

// ---------------------------------------------------------------- note

describe("note", () => {
  it("saves after a pause in typing, and the chip shows the first line", async () => {
    app = await openApp();
    await app.click("noteChip");
    await app.page.locator("#noteInput").fill("\ncall the bank about the transfer tomorrow\nsecond line");
    assert.equal(await app.db("notes/santi"), null, "not written on every keystroke");
    await app.run(900);
    assert.equal((await app.db("notes/santi")).text, "\ncall the bank about the transfer tomorrow\nsecond line");
    assert.equal(await app.text("noteBadge"), "call the bank about t…");
  });

  it("a remote edit waits until the box loses focus", async () => {
    app = await openApp({ seedDb: { notes: { santi: { text: "old", updatedAt: 1 } } } });
    await app.run(100);
    assert.equal(await app.page.locator("#noteInput").inputValue(), "old");
    await app.click("noteChip"); // focuses the box
    await app.remote("notes/santi", { text: "from the other laptop", updatedAt: 2 });
    assert.equal(await app.page.locator("#noteInput").inputValue(), "old");
    await app.page.locator("#noteInput").blur();
    assert.equal(await app.page.locator("#noteInput").inputValue(), "from the other laptop");
  });
});

// ---------------------------------------------------------------- messages

describe("messages", () => {
  const note = (text, sentAt = 111) => ({ note: { text, sentAt } });

  it("an idle recipient can read straight away; opening writes the receipt", async () => {
    app = await openApp({ seedDb: { messages: { santi: note("hi from K") } } });
    await app.run(100);
    assert.equal(await app.text("messageBadge"), "1 message — read it");
    assert.equal(await app.has("messageIcon", "live"), true);
    assert.equal(await app.db("messages/santi/read"), null, "no receipt before opening");
    await app.click("messageChip");
    assert.equal(await app.text("inboxText"), "hi from K");
    assert.equal(await app.db("messages/santi/read"), 111);
    await app.run(300);
    assert.equal(await app.text("messageBadge"), "Message");
  });

  it("stays sealed while running, unseals at zero", async () => {
    app = await openApp();
    await app.setDuration(1);
    await app.click("startBtn");
    await app.remote("messages/santi", note("for later"));
    await app.run(300);
    assert.equal(await app.text("messageBadge"), "message when you're done");
    await app.click("messageChip");
    assert.equal(await app.text("inboxText"), "Sealed until this session ends.");
    assert.equal(await app.db("messages/santi/read"), null, "no receipt while sealed");
    await app.click("messageChip"); // close it again

    await app.run(MIN);
    assert.equal(await app.text("messageBadge"), "1 message — read it");
    const n = await app.page.evaluate(() => window.__notifications);
    assert.equal(n.length, 1);
    assert.match(n[0].body, /A message is waiting for you/);
  });

  it("sending writes only the note child of the recipient's slot", async () => {
    app = await openApp();
    await app.click("messageChip");
    assert.equal(await app.page.locator("#messageSend").isDisabled(), true);
    await app.page.locator("#messageInput").fill("dinner at 7?");
    await app.click("messageSend");
    const msgWrites = (await app.writes()).filter((w) => w.path.startsWith("messages"));
    assert.deepEqual(msgWrites.map((w) => w.path), ["messages/kristina/note"]);
    assert.equal(msgWrites[0].value.text, "dinner at 7?");
    assert.equal(typeof msgWrites[0].value.sentAt, "number");
    assert.equal(await app.text("messageStatus"), "waiting for Kristina");
  });

  it("a read receipt clears the compose box and says when", async () => {
    app = await openApp({ seedDb: { messages: { kristina: note("dinner at 7?", T0 - 5 * MIN) } } });
    await app.run(100);
    assert.equal(await app.page.locator("#messageInput").inputValue(), "dinner at 7?", "pending text is prefilled");
    await app.remote("messages/kristina/read", T0 - 5 * MIN);
    await app.click("messageChip");
    assert.equal(await app.page.locator("#messageInput").inputValue(), "");
    assert.match(await app.text("messageStatus"), /^read \d{1,2}:\d{2}\s?[AP]M · send another$/);
  });
});

// ---------------------------------------------------------------- alert

describe("end-of-session alert", () => {
  it("chimes and notifies once, naming the category", async () => {
    app = await openApp();
    await app.page.locator("#categoryInput").fill("Thesis");
    await app.setDuration(1);
    await app.click("startBtn");
    await app.run(MIN + 500);
    const n = await app.page.evaluate(() => window.__notifications);
    assert.equal(n.length, 1);
    assert.equal(n[0].title, "Time's up");
    assert.equal(n[0].tag, "focus-timer-end");
    assert.equal(n[0].body, "Finished: Thesis");
    assert.deepEqual(await app.page.evaluate(() => window.__tones), [880, 1318.5]);

    await app.run(2 * MIN);
    assert.equal((await app.page.evaluate(() => window.__notifications)).length, 1);
    assert.equal((await app.page.evaluate(() => window.__tones)).length, 2);
  });

  it("a paused run never alerts", async () => {
    app = await openApp();
    await app.setDuration(1);
    await app.click("startBtn");
    await app.run(20_000);
    await app.click("pauseBtn");
    await app.run(2 * MIN);
    assert.equal((await app.page.evaluate(() => window.__notifications)).length, 0);
    assert.equal(await app.page.title(), "Shared Focus Timer");
  });
});

// ---------------------------------------------------------------- title flash

describe("title flash", () => {
  const ALERT = "⏰ Time's up!";
  const BASE = "Shared Focus Timer";

  // The blink is driven by a Web Worker, which runs on real time rather than
  // the test's paused clock, so it is sampled over real seconds.
  async function titlesOver(ms) {
    const seen = new Set();
    const end = Date.now() + ms;
    while (Date.now() < end) {
      seen.add(await app.page.title());
      await new Promise((r) => setTimeout(r, 100));
    }
    return seen;
  }

  async function finishSession() {
    app = await openApp();
    await app.setDuration(1);
    await app.click("startBtn");
    await app.run(MIN + 500);
  }

  it("blinks, and is still blinking long after the session ended", async () => {
    await finishSession();
    assert.deepEqual(await titlesOver(2500), new Set([ALERT, BASE]));
    await app.run(30 * MIN);
    assert.deepEqual(await titlesOver(2500), new Set([ALERT, BASE]), "no time limit");
  });

  it("stops on a click anywhere", async () => {
    await finishSession();
    await app.page.mouse.click(640, 5);
    assert.deepEqual(await titlesOver(1500), new Set([BASE]));
  });

  it("stops on a keypress", async () => {
    await finishSession();
    await app.page.keyboard.press("Shift");
    assert.deepEqual(await titlesOver(1500), new Set([BASE]));
  });

  it("stops when the window regains focus", async () => {
    await finishSession();
    await app.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    assert.deepEqual(await titlesOver(1500), new Set([BASE]));
  });

  it("stops when the tab becomes visible again", async () => {
    await finishSession();
    await app.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    assert.deepEqual(await titlesOver(1500), new Set([BASE]));
  });

  it("stops on Start and on Reset, however they are triggered", async () => {
    await finishSession();
    // Called directly, with no click or key event, so only the timer's own
    // "start" event can stop it.
    await app.page.evaluate(() => import("./js/timer.js").then((t) => t.start()));
    assert.deepEqual(await titlesOver(1500), new Set([BASE]));

    await app.run(MIN + 500);
    assert.ok((await titlesOver(1500)).has(ALERT), "a second session flashes again");
    await app.page.evaluate(() => import("./js/timer.js").then((t) => t.reset()));
    assert.deepEqual(await titlesOver(1500), new Set([BASE]));
  });
});

// ---------------------------------------------------------------- status

describe("status", () => {
  const typeStatus = async (app, text) => {
    await app.page.locator("#statusInput").fill(text);
    await app.page.locator("#statusInput").press("Enter");
    await app.run(250);
  };

  it("sets a typed status in room/<me>, trimmed, with a server timestamp", async () => {
    app = await openApp();
    await typeStatus(app, "  out   with friends ");
    const status = (await app.db("room/santi")).status;
    assert.equal(status.text, "out with friends");
    assert.equal(typeof status.setAt, "number");
    assert.equal(await app.text("statusAge"), "set just now");
  });

  it("sets a preset in one tap, and the × clears it", async () => {
    app = await openApp({ device: "phone" });
    await app.page.locator(".status-preset", { hasText: "eating" }).click();
    await app.run(250);
    assert.equal((await app.db("room/santi")).status.text, "eating");
    assert.equal(await app.page.locator("#statusInput").inputValue(), "eating");

    await app.click("statusClear");
    await app.run(250);
    assert.equal(await app.db("room/santi/status"), null);
    assert.equal(await app.page.locator("#statusInput").inputValue(), "");
  });

  it("shows in the other person's pill with its age", async () => {
    app = await openApp({
      role: "kristina",
      seedDb: { room: { santi: { running: false, status: { text: "eating", setAt: T0 - 40 * MIN } } } },
    });
    await app.run(250);
    assert.equal(await app.text("presenceState"), "eating · 40m ago");

    await app.remote("room/santi/status", null);
    await app.run(250);
    assert.equal(await app.text("presenceState"), "not working");
  });

  it("is cleared by Start and hidden while the timer runs", async () => {
    app = await openApp();
    await typeStatus(app, "eating");
    await app.click("startBtn");
    await app.run(250);
    assert.equal(await app.db("room/santi/status"), null);
    assert.equal(await app.page.locator("#statusRow").isVisible(), false);

    await app.click("pauseBtn");
    await app.run(250);
    assert.equal(await app.page.locator("#statusRow").isVisible(), true);
    assert.equal(await app.page.locator("#statusInput").inputValue(), "");
  });

  it("survives the laptop publishing its timer", async () => {
    // Set from the phone; the laptop then pauses/resets, which republishes
    // every timer field.
    app = await openApp({
      seedDb: { room: { santi: { running: false, status: { text: "errands", setAt: T0 } } } },
    });
    await app.click("resetBtn");
    await app.setDuration(30);
    await app.run(250);
    assert.equal((await app.db("room/santi")).status.text, "errands");
    assert.equal(await app.page.locator("#statusInput").inputValue(), "errands");
  });
});

// ---------------------------------------------------------------- phone

describe("phone (remote) mode", () => {
  const laptopRunning = {
    running: true, startedAt: T0 - MIN + 1000, remainingAtStart: 1500, category: "Thesis",
  };

  it("hides the controls and never claims the timer", async () => {
    app = await openApp({ device: "phone" });
    await app.run(1000);
    for (const id of ["startBtn", "pauseBtn", "resetBtn", "durationInput", "modeToggle", "categoryInput"]) {
      assert.equal(await app.page.locator("#" + id).isVisible(), false, id + " should be hidden");
    }
    const writes = await app.writes();
    assert.equal(writes.some((w) => w.op.startsWith("onDisconnect")), false,
      "a phone must not mark you not-working when its screen locks");
    assert.equal(writes.some((w) => w.path === "room/santi" && "running" in (w.value || {})), false);
    assert.match(await app.text("uidDebug"), /santi · phone · uid/);
  });

  it("shows the laptop's running timer read-only", async () => {
    app = await openApp({ device: "phone", seedDb: { room: { santi: laptopRunning } } });
    await app.run(250);
    assert.equal(await app.text("timerDisplay"), "24:00");
    assert.equal(await app.text("stageLabel"), "Focusing");
    assert.equal(await app.text("remoteNote"), "on your laptop · Thesis");
    assert.equal(await app.page.locator("#statusRow").isVisible(), false);

    await app.remote("room/santi", { running: false, remainingAtStart: 1380 });
    await app.run(250);
    assert.equal(await app.text("timerDisplay"), "23:00");
    assert.equal(await app.text("stageLabel"), "Focus");
    assert.equal(await app.page.locator("#statusRow").isVisible(), true);
  });

  it("shows only the timer, the status and the other person", async () => {
    app = await openApp({
      device: "phone",
      seedDb: { room: { santi: { running: false, remainingAtStart: 1500 } } },
    });
    await app.run(250);
    for (const id of ["cornerDock", "noteWidget", "messageWidget"]) {
      assert.equal(await app.page.locator("#" + id).isVisible(), false, id + " should be hidden");
    }
    for (const id of ["timerDisplay", "statusInput", "statusLabel", "presenceWidget"]) {
      assert.equal(await app.page.locator("#" + id).isVisible(), true, id + " should show");
    }
    assert.equal(await app.page.locator(".status-preset").count(), 5);
  });
});

// ---------------------------------------------------------------- wallpapers

describe("wallpapers", () => {
  const hours = (h) => ({
    sessions: { santi: { a: { endedAt: T0 - 3600_000, elapsedSeconds: h * 3600, categoryKey: "thesis" } } },
  });
  const bg = (app) => app.page.locator("#backgroundLayer").getAttribute("data-bg");
  const option = (app, id) => app.page.locator('.wp-option[data-id="' + id + '"]');

  it("starts on the swirl with everything else locked", async () => {
    app = await openApp({ seedDb: hours(62) });
    await app.run(250);
    assert.equal(await bg(app), "swirl");
    await app.click("statsChip");
    assert.equal(await option(app, "rain").isDisabled(), true);
    assert.equal((await option(app, "rain").textContent()).trim(), "Rainy window62 / 100 h");
    assert.equal(await app.has("statsChip", "has-new"), false);
  });

  it("chooses an unlocked one and keeps it across a reload", async () => {
    app = await openApp({ seedDb: hours(120) });
    await app.run(250);
    await app.click("statsChip");
    await option(app, "rain").click();
    assert.equal(await bg(app), "rain");
    assert.equal(await app.page.evaluate(() => localStorage.getItem("wallpaper:santi")), '"rain"');

    await app.page.reload();
    await app.run(50);
    assert.equal(await bg(app), "rain", "the stored choice paints before the log loads");
  });

  it("marks a new unlock on the chip until the panel is opened", async () => {
    app = await openApp({ seedDb: hours(120) });
    await app.run(250);
    assert.equal(await app.has("statsChip", "has-new"), true);
    await app.click("statsChip");
    assert.equal(await app.has("statsChip", "has-new"), false);
    await app.page.reload();
    await app.run(250);
    assert.equal(await app.has("statsChip", "has-new"), false);
  });

  it("paints the hills' sky for the pinned hour", async () => {
    app = await openApp();
    await app.page.goto(app.page.url().split("?")[0] + "?bg=hills&sky=13");
    await app.run(250);
    assert.equal(await bg(app), "hills");
    const v = (name) => app.page.locator(".wp-hills").evaluate((el, n) => el.style.getPropertyValue(n), name);
    assert.equal(await v("--sky-top"), "#86bde8");
    assert.equal(await v("--sun-on"), "1");
    assert.equal(await v("--moon-on"), "0");
  });

  it("draws the koi pond with four fish and lights it for the pinned hour", async () => {
    app = await openApp();
    await app.page.goto(app.page.url().split("?")[0] + "?bg=koi&sky=13");
    await app.run(250);
    assert.equal(await bg(app), "koi");
    assert.equal(await app.page.locator(".koi-school .koi-swim").count(), 4);
    assert.equal(await app.page.locator(".koi-shadows .koi-swim").count(), 4);
    assert.equal(await app.page.locator(".koi-school .koi-sway").first().isVisible(), true);
    const v = (name) => app.page.locator(".wp-koi").evaluate((el, n) => el.style.getPropertyValue(n), name);
    assert.equal(await v("--pond-light"), "#ffffff");
    assert.equal(await v("--sun-on"), "1");

    await app.page.goto(app.page.url().split("?")[0] + "?bg=koi&sky=23");
    await app.run(250);
    assert.equal(await v("--moon-on"), "1");
    assert.notEqual(await v("--pond-light"), "#ffffff");
    assert.deepEqual(app.errors, []);
  });

  it("previews with ?bg= without unlocking or saving", async () => {
    app = await openApp({ seedDb: hours(1) });
    await app.page.goto(app.page.url().split("?")[0] + "?bg=rain");
    await app.run(250);
    assert.equal(await bg(app), "rain");
    assert.equal(await app.page.evaluate(() => localStorage.getItem("wallpaper:santi")), null);
  });
});
