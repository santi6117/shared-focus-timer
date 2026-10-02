// Shared setup for the browser tests: one Chromium for the whole run, a fresh
// context (so fresh localStorage) per test, Firebase swapped for the
// in-memory fake, and the page clock under test control so a 25-minute
// session takes milliseconds.

import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { startServer } from "./server.js";

const FAKE_FIREBASE = await readFile(new URL("./fake-firebase.js", import.meta.url), "utf8");

// Wednesday, mid-morning, so "today" and "earlier this week" are both
// non-trivial for the stats tests (weeks start Monday).
export const T0 = new Date("2026-09-30T10:00:00-04:00").getTime();
export const MIN = 60_000;

let browser, server;

export async function setup() {
  server = await startServer();
  browser = await chromium.launch(
    process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
  );
}

export async function teardown() {
  await browser?.close();
  server?.close();
}

// Runs before any page script. Stubs the two browser APIs that can't be
// observed from outside (notifications, audio) and seeds storage once.
function initScript({ seedStorage, seedDb, role }) {
  window.__role = role;
  window.__seedDb = seedDb;
  if (!sessionStorage.getItem("__seeded")) {
    sessionStorage.setItem("__seeded", "1");
    for (const [k, v] of Object.entries(seedStorage)) localStorage.setItem(k, v);
  }

  window.__notifications = [];
  class FakeNotification {
    constructor(title, opts) { window.__notifications.push({ title, ...opts }); }
    close() {}
  }
  FakeNotification.permission = "granted";
  FakeNotification.requestPermission = () => Promise.resolve("granted");
  window.Notification = FakeNotification;

  window.__tones = [];
  class FakeAudioContext {
    constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; }
    resume() { return Promise.resolve(); }
    createOscillator() {
      const osc = {
        type: "sine",
        frequency: { setValueAtTime: (f) => { osc.freq = f; } },
        connect() {}, start() { window.__tones.push(osc.freq); }, stop() {},
      };
      return osc;
    }
    createGain() {
      const ramp = () => {};
      return { gain: { setValueAtTime: ramp, exponentialRampToValueAtTime: ramp }, connect() {} };
    }
  }
  window.AudioContext = FakeAudioContext;
}

/**
 * Open the app as one person.
 *   role         "santi" | "kristina" | null (no ?me= at all)
 *   seedStorage  localStorage entries to exist before first load
 *   seedDb       initial database tree
 *   time         wall-clock time the page starts at
 *   device       "phone" | "laptop" — sets ?device=, overriding detection
 */
export async function openApp({ role = "santi", seedStorage = {}, seedDb = {}, time = T0, device = "laptop" } = {}) {
  const context = await browser.newContext({ timezoneId: "America/New_York" });
  // The app-compat script becomes the whole fake; the other two are empty.
  // (Playwright runs the most recently registered matching route first.)
  await context.route(/gstatic\.com\/firebasejs\//, (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }));
  await context.route(/gstatic\.com\/firebasejs\/.*firebase-app-compat\.js/, (route) =>
    route.fulfill({ contentType: "text/javascript", body: FAKE_FIREBASE }));
  await context.addInitScript(initScript, { seedStorage, seedDb, role: role || "none" });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e));
  // Frozen, not free-running: time moves only when a test calls run(), so
  // every countdown value a test checks is exact.
  await page.clock.install({ time: time - 1000 });
  await page.clock.pauseAt(time);
  await page.goto(server.url + (role ? "?me=" + role + "&device=" + device : ""));
  // Timer callbacks that throw surface here; record them like page errors.
  try { await page.clock.runFor(50); } catch (e) { errors.push(e); }

  const app = {
    page,
    errors,
    close: () => context.close(),
    run: (ms) => page.clock.runFor(ms),
    text: (id) => page.locator("#" + id).evaluate((el) => el.textContent.trim()),
    click: (id) => page.locator("#" + id).click(),
    has: (id, cls) => page.locator("#" + id).evaluate((el, c) => el.classList.contains(c), cls),
    db: (path) => page.evaluate((p) => window.__fakeDb.get(p), path),
    remote: (path, value) => page.evaluate(([p, v]) => window.__fakeDb.set(p, v), [path, value]),
    writes: () => page.evaluate(() => window.__fakeDb.writes),
    sessions: async () => Object.values((await app.db("sessions/" + (role || "santi"))) || {}),
    now: () => page.evaluate(() => Date.now()),
    async setDuration(minutes) {
      await page.locator("#durationInput").fill(String(minutes));
      await page.locator("#durationInput").dispatchEvent("change");
    },
  };
  return app;
}
