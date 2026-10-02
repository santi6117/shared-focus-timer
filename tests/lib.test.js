// Unit tests for js/lib/: the pure logic, tested directly in Node without a
// browser. Run with TZ=America/New_York (npm test sets it) so the DST cases
// are real.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatClock, formatTotal, startOfDay, startOfWeek } from "../js/lib/time.js";
import {
  defaultTimer, parseTimer, remainingMs, elapsedMs, planRecovery, STALE_MS,
} from "../js/lib/timer-math.js";
import {
  normalizeKey, pickColor, totals, breakdown, CATEGORY_PALETTE, UNCATEGORIZED_KEY,
} from "../js/lib/categories.js";
import { isUnread, chipLabel, outboxStatus } from "../js/lib/messages.js";
import {
  WALLPAPERS, unlockedIds, progressLabel, resolveWallpaper, newlyUnlocked,
} from "../js/lib/wallpapers.js";
import { normalizeStatus, formatAgo, idleText, STATUS_MAX } from "../js/lib/status.js";

const MIN = 60_000;
const local = (s) => new Date(s).getTime();

describe("time formatting", () => {
  it("floors the clock and never goes negative", () => {
    assert.equal(formatClock(1500000), "25:00");
    assert.equal(formatClock(1499001), "24:59");
    assert.equal(formatClock(999), "0:00");
    assert.equal(formatClock(-5000), "0:00");
    assert.equal(formatClock(600 * MIN), "600:00");
  });
  it("formats totals in minutes, then hours", () => {
    assert.equal(formatTotal(0), "0m");
    assert.equal(formatTotal(59 * 60), "59m");
    assert.equal(formatTotal(60 * 60), "1h 0m");
    assert.equal(formatTotal(185 * 60), "3h 5m");
  });
});

describe("calendar boundaries", () => {
  it("weeks start Monday", () => {
    const wed = local("2026-09-30T15:00:00");
    assert.equal(startOfWeek(wed), local("2026-09-28T00:00:00"));
    const sun = local("2026-10-04T23:00:00");
    assert.equal(startOfWeek(sun), local("2026-09-28T00:00:00"));
    const mon = local("2026-09-28T00:00:00");
    assert.equal(startOfWeek(mon), mon);
  });
  it("survives the DST change (US clocks fall back 2026-11-01)", () => {
    const afterDst = local("2026-11-02T09:00:00");   // Monday after the change
    assert.equal(startOfWeek(afterDst), local("2026-11-02T00:00:00"));
    const sunDst = local("2026-11-01T12:00:00");      // the 25-hour Sunday
    assert.equal(startOfDay(sunDst), local("2026-11-01T00:00:00"));
    assert.equal(startOfWeek(sunDst), local("2026-10-26T00:00:00"));
  });
});

describe("timer math", () => {
  it("parses saved state over the defaults", () => {
    assert.deepEqual(parseTimer(null), defaultTimer());
    assert.deepEqual(parseTimer("not json"), defaultTimer());
    const old = parseTimer(JSON.stringify({ duration: 60000, running: false }));
    assert.equal(old.logged, false, "fields added later get their defaults");
    assert.equal(old.duration, 60000);
  });

  it("derives remaining and clamps elapsed", () => {
    const t = { ...defaultTimer(), running: true, startedAt: 1000, remainingAtStart: 25 * MIN, duration: 25 * MIN };
    assert.equal(remainingMs(t, 1000 + MIN), 24 * MIN);
    assert.equal(elapsedMs(t, 1000 + MIN), MIN);
    assert.equal(elapsedMs(t, 1000 + 8 * 60 * MIN), 25 * MIN, "overnight overrun capped");
    const resumed = { ...t, remainingAtStart: 10 * MIN };
    assert.equal(elapsedMs(resumed, 1000), 15 * MIN, "counts time worked before the pause");
  });

  const run = (o) => ({ ...defaultTimer(), running: true, duration: 45 * MIN, remainingAtStart: 45 * MIN, ...o });
  const now = 10 * 60 * 60 * MIN;

  it("recovery: ends at the last heartbeat", () => {
    const startedAt = now - 3 * 60 * MIN;
    assert.deepEqual(planRecovery(run({ startedAt, lastTickAt: startedAt + 10 * MIN }), now), { workedMs: 10 * MIN });
  });
  it("recovery: capped at zero", () => {
    const startedAt = now - 5 * 60 * MIN;
    assert.deepEqual(planRecovery(run({ startedAt, lastTickAt: startedAt + 3 * 60 * MIN }), now), { workedMs: 45 * MIN });
  });
  it("recovery: a fresh heartbeat is an ordinary refresh", () => {
    assert.equal(planRecovery(run({ startedAt: now - 2 * MIN, lastTickAt: now - STALE_MS + 1 }), now), null);
  });
  it("recovery: no heartbeat at all recovers zero work", () => {
    assert.deepEqual(planRecovery(run({ startedAt: now - 60 * MIN }), now), { workedMs: 0 });
  });
  it("recovery: nothing to do when not running", () => {
    assert.equal(planRecovery(defaultTimer(), now), null);
  });
});

describe("categories", () => {
  it("normalises case and whitespace into one key", () => {
    assert.equal(normalizeKey("  Thesis  "), "thesis");
    assert.equal(normalizeKey("Real   Analysis"), "real analysis");
  });
  it("picks the first unused colour, then cycles", () => {
    assert.equal(pickColor({}), CATEGORY_PALETTE[0]);
    assert.equal(pickColor({ a: { color: CATEGORY_PALETTE[0] } }), CATEGORY_PALETTE[1]);
    const full = Object.fromEntries(CATEGORY_PALETTE.map((c, i) => ["k" + i, { color: c }]));
    assert.equal(pickColor(full), CATEGORY_PALETTE[0]);
  });
  it("totals by day, week and all time", () => {
    const s = [
      { endedAt: 50, elapsedSeconds: 10 },
      { endedAt: 150, elapsedSeconds: 20 },
      { endedAt: 250, elapsedSeconds: 30 },
    ];
    assert.deepEqual(totals(s, { startOfToday: 200, startOfWeek: 100 }), { today: 30, week: 50, all: 60 });
  });
  it("breakdown keeps the remainder so shares sum to the total", () => {
    const s = [
      { endedAt: 10, elapsedSeconds: 100, categoryKey: "a" },
      { endedAt: 10, elapsedSeconds: 50, categoryKey: "b" },
      { endedAt: 10, elapsedSeconds: 40 },
      { endedAt: 10, elapsedSeconds: 30, categoryKey: "d" },
      { endedAt: 10, elapsedSeconds: 20, categoryKey: "e" },
      { endedAt: 1, elapsedSeconds: 999, categoryKey: "old" },
    ];
    const b = breakdown(s, 5);
    assert.equal(b.grand, 240);
    assert.deepEqual(b.top.map((x) => x.key), ["a", "b", UNCATEGORIZED_KEY]);
    assert.equal(b.restCount, 2);
    assert.equal(b.restSeconds, 50);
  });
});

describe("messages", () => {
  const slot = (read) => ({ note: { text: "hi", sentAt: 5 }, read });
  it("unread is an exact match on sentAt", () => {
    assert.equal(isUnread(null), false);
    assert.equal(isUnread({ note: { text: "", sentAt: 5 } }), false);
    assert.equal(isUnread(slot(undefined)), true);
    assert.equal(isUnread(slot(4)), true);
    assert.equal(isUnread(slot(5)), false);
  });
  it("chip labels", () => {
    assert.equal(chipLabel(false, true), "Message");
    assert.equal(chipLabel(true, true), "message when you're done");
    assert.equal(chipLabel(true, false), "1 message — read it");
  });
  it("outbox status", () => {
    const fmt = () => "3:05 PM";
    assert.equal(outboxStatus(null, "Kristina", fmt), "nothing waiting");
    assert.equal(outboxStatus(slot(undefined), "Kristina", fmt), "waiting for Kristina");
    assert.equal(outboxStatus(slot(5), "Kristina", fmt), "read 3:05 PM · send another");
  });
});

describe("status", () => {
  it("normalizes: trims, collapses spaces, caps length", () => {
    assert.equal(normalizeStatus("  out   with  friends "), "out with friends");
    assert.equal(normalizeStatus("   "), "");
    assert.equal(normalizeStatus(null), "");
    assert.equal(normalizeStatus("x".repeat(60)).length, STATUS_MAX);
  });

  it("formats age coarsely", () => {
    assert.equal(formatAgo(30_000), "just now");
    assert.equal(formatAgo(-5000), "just now", "clock skew never shows a negative age");
    assert.equal(formatAgo(40 * MIN), "40m ago");
    assert.equal(formatAgo(14 * 60 * MIN), "14h ago");
    assert.equal(formatAgo(3 * 24 * 60 * MIN), "3d ago");
  });

  it("falls back to 'not working' with no status", () => {
    assert.equal(idleText(null, 0), "not working");
    assert.equal(idleText({ text: "" }, 0), "not working");
    assert.equal(idleText({ text: "eating", setAt: 0 }, 40 * MIN), "eating · 40m ago");
    assert.equal(idleText({ text: "eating" }, 40 * MIN), "eating", "a pending server timestamp shows no age");
  });
});

describe("wallpapers", () => {
  const H = 3600;
  it("unlocks by whole hours, swirl always", () => {
    assert.deepEqual(unlockedIds(0), ["swirl"]);
    assert.deepEqual(unlockedIds(100 * H - 1), ["swirl"]);
    assert.deepEqual(unlockedIds(100 * H), ["swirl", "rain"]);
    assert.deepEqual(unlockedIds(350 * H), WALLPAPERS.map((w) => w.id));
  });

  it("floors progress so it never claims an hour early", () => {
    assert.equal(progressLabel("rain", 62 * H + 3599), "62 / 100 h");
  });

  it("resolves preview, then stored choice, then the default", () => {
    assert.equal(resolveWallpaper(null, null), "swirl");
    assert.equal(resolveWallpaper("rain", null), "rain");
    assert.equal(resolveWallpaper("rain", "swirl"), "swirl");
    assert.equal(resolveWallpaper("nonsense", null), "swirl");
    assert.equal(resolveWallpaper(null, "koi"), "swirl", "an unbuilt one can't be previewed");
  });

  it("counts only built, unseen unlocks as new", () => {
    assert.deepEqual(newlyUnlocked(120 * H, []), ["rain"]);
    assert.deepEqual(newlyUnlocked(120 * H, ["rain"]), []);
    assert.deepEqual(newlyUnlocked(250 * H, ["rain"]), [], "hills isn't built yet");
  });
});
