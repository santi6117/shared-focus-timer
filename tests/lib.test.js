// Unit tests for js/lib/: the pure logic, tested directly in Node without a
// browser. Run with TZ=America/New_York (npm test sets it) so the DST cases
// are real.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatClock, formatElapsed, formatTotal, startOfDay, startOfWeek, endOfDay } from "../js/lib/time.js";
import {
  defaultTimer, parseTimer, remainingMs, elapsedMs, planRecovery, STALE_MS,
  shownMs, STOPWATCH_CAP_MS,
} from "../js/lib/timer-math.js";
import {
  normalizeKey, pickColor, totals, breakdown, CATEGORY_PALETTE, UNCATEGORIZED_KEY,
  shareableToday, readSharedToday, OTHER_COLOR,
} from "../js/lib/categories.js";
import { isUnread, chipLabel, outboxStatus } from "../js/lib/messages.js";
import {
  WALLPAPERS, unlockedIds, progressLabel, resolveWallpaper, newlyUnlocked,
} from "../js/lib/wallpapers.js";
import { skyAt, mix } from "../js/lib/sky.js";
import { pondAt } from "../js/lib/pond.js";
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
  it("formats the stopwatch with hours once past the hour", () => {
    assert.equal(formatElapsed(0), "0:00");
    assert.equal(formatElapsed(59 * MIN + 59_999), "59:59");
    assert.equal(formatElapsed(60 * MIN), "1:00:00");
    assert.equal(formatElapsed(65 * MIN + 9000), "1:05:09");
    assert.equal(formatElapsed(-1), "0:00");
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

describe("shared today", () => {
  const b = { grand: 300, top: [{ key: "a", seconds: 200 }, { key: "b", seconds: 60 }], restCount: 1, restSeconds: 40 };
  const pub = shareableToday(b, (k) => k.toUpperCase(), (k) => "#" + k, 1000);

  it("publishes labels and colours, not keys", () => {
    assert.deepEqual(pub, {
      until: 1000, seconds: 300, restCount: 1, restSeconds: 40,
      top: [{ label: "A", color: "#a", seconds: 200 }, { label: "B", color: "#b", seconds: 60 }],
    });
  });
  it("reads back a current summary, including Firebase's array-as-object", () => {
    const asObject = { ...pub, top: { 0: pub.top[0], 1: pub.top[1] } };
    const r = readSharedToday(asObject, 999);
    assert.equal(r.grand, 300);
    assert.deepEqual(r.top.map((x) => x.label), ["A", "B"]);
  });
  it("treats yesterday's, empty and malformed summaries as nothing logged", () => {
    assert.equal(readSharedToday(pub, 1000), null);
    assert.equal(readSharedToday(null, 0), null);
    assert.equal(readSharedToday({ until: 9e15, seconds: 0 }, 0), null);
    assert.equal(readSharedToday({ until: "soon", seconds: 5 }, 0), null);
    const r = readSharedToday({ until: 9e15, seconds: 50, top: [{ label: "x", seconds: 50 }, { seconds: 3 }] }, 0);
    assert.deepEqual(r.top, [{ label: "x", color: OTHER_COLOR, seconds: 50 }]);
  });
  it("ends the day at the next local midnight, across a DST change", () => {
    const sat = new Date(2026, 10, 1, 0, 30).getTime(); // US clocks go back 1 Nov
    assert.equal(endOfDay(sat), new Date(2026, 10, 2).getTime());
    assert.equal(endOfDay(sat) - startOfDay(sat), 25 * 3600_000);
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
    assert.equal(resolveWallpaper(null, "koi"), "koi");
  });

  it("counts only built, unseen unlocks as new", () => {
    assert.deepEqual(newlyUnlocked(120 * H, []), ["rain"]);
    assert.deepEqual(newlyUnlocked(120 * H, ["rain"]), []);
    assert.deepEqual(newlyUnlocked(250 * H, ["rain"]), ["hills"]);
    assert.deepEqual(newlyUnlocked(350 * H, ["rain", "hills"]), ["koi"]);
  });
});

describe("sky", () => {
  it("blends colours linearly", () => {
    assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
    assert.equal(mix("#123456", "#abcdef", 0), "#123456");
  });

  it("hits its keyframes exactly and wraps around midnight", () => {
    assert.equal(skyAt(13).skyTop, "#86bde8");
    assert.deepEqual(skyAt(24), skyAt(0));
    assert.deepEqual(skyAt(-1), skyAt(23));
  });

  it("shows the sun by day and stars and moon by night", () => {
    const noon = skyAt(12.5), midnight = skyAt(0);
    assert.equal(noon.sun.visible, true);
    assert.equal(noon.moon.visible, false);
    assert.equal(noon.stars, 0);
    assert.ok(noon.sun.y < 25, "high at midday");
    assert.equal(midnight.sun.visible, false);
    assert.equal(midnight.moon.visible, true);
    assert.equal(midnight.stars, 1);
  });

  it("puts the sun low and orange near sunset", () => {
    const late = skyAt(18.5);
    assert.ok(late.sun.y > 60);
    assert.ok(late.sun.x > 85);
    assert.notEqual(late.sun.color, skyAt(12.5).sun.color);
  });
});

describe("pond light", () => {
  it("leaves the pond untouched at midday and wraps around midnight", () => {
    assert.equal(pondAt(13).light, "#ffffff");
    assert.deepEqual(pondAt(24), pondAt(0));
    assert.deepEqual(pondAt(-1), pondAt(23));
  });

  it("dims at night without going black, and reflects the moon", () => {
    const night = pondAt(23);
    const lum = parseInt(night.light.slice(1, 3), 16) + parseInt(night.light.slice(3, 5), 16) + parseInt(night.light.slice(5, 7), 16);
    assert.ok(lum < 3 * 140, "dark");
    assert.ok(lum > 3 * 70, "but the koi stay visible");
    assert.equal(night.moon.visible, true);
    assert.equal(night.sun.visible, false);
  });

  it("reflects the sun where Paper hills draws it", () => {
    for (const h of [7, 12.5, 18.5]) {
      assert.equal(pondAt(h).sun.x, skyAt(h).sun.x);
      assert.equal(pondAt(h).sun.y, skyAt(h).sun.y);
    }
  });
});

describe("stopwatch maths", () => {
  it("shows time used for a stopwatch, time left for a countdown", () => {
    assert.equal(shownMs("countdown", 20 * MIN, 25 * MIN), 20 * MIN);
    assert.equal(shownMs("stopwatch", STOPWATCH_CAP_MS - 5 * MIN, STOPWATCH_CAP_MS), 5 * MIN);
    assert.equal(shownMs("stopwatch", -MIN, STOPWATCH_CAP_MS), STOPWATCH_CAP_MS, "clamped at the cap");
    assert.equal(shownMs(undefined, 7, 9), 7, "a peer without a mode field is a countdown");
  });

  it("older saved state keeps its countdown length as the minutes setting", () => {
    const t = parseTimer(JSON.stringify({ duration: 45 * MIN, remainingAtStart: 45 * MIN }));
    assert.equal(t.mode, "countdown");
    assert.equal(t.countdownDuration, 45 * MIN);
  });

  it("a crashed stopwatch logs at most the cap", () => {
    const t = { ...defaultTimer(), mode: "stopwatch", duration: STOPWATCH_CAP_MS,
      remainingAtStart: STOPWATCH_CAP_MS, running: true, startedAt: 0, lastTickAt: 3 * 60 * MIN };
    assert.deepEqual(planRecovery(t, 10 * 60 * MIN), { workedMs: STOPWATCH_CAP_MS });
  });
});
