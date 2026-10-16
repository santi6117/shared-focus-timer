// The session log: writing finished blocks of work to sessions/<me>, and
// holding the whole log in memory for the stats.
//
// Append-only. One record per session, never updated, never deleted, never
// read by the other person. push() generates chronologically ordered keys,
// so the log sorts itself.
//
// The whole log is held in memory and re-summed on demand rather than kept
// as running totals in the database: totals would have to be recomputed
// whenever the buckets change (a new week start, a category filter), and
// this app will never hold more than a few thousand tiny records.

import { refs, TIMESTAMP } from "./firebase.js";
import * as timer from "./timer.js";
import * as categories from "./categories.js";
import { UNCATEGORIZED_KEY } from "./lib/categories.js";

const log = [];
const listeners = [];
let initialLoadComplete = false;
let connected = false;

export function all() { return log; }
export function onChange(fn) { listeners.push(fn); }
export function isInitialLoadComplete() { return initialLoadComplete; }

async function write({ ms, categoryLabel }) {
  const key = categories.keyFor(categoryLabel);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const data = {
    endedAt: TIMESTAMP,
    elapsedSeconds: Math.round(ms / 1000),
    categoryKey: key,
    timeZone,
    activityVersion: 1,
  };
  await refs.sessions.push(data);
  // The database listeners supply the resolved timestamp, including corrections.
  categories.recordUse(key, categoryLabel);
}

export function init() {
  timer.on("session", (work) => categories.whenReady(() => {
    write(work).catch((error) => console.error("Session could not be saved:", error));
  }));

  // child_added retains the efficient initial/live log. The value event is
  // the explicit boundary for the complete initial snapshot; don't infer
  // history completeness from a quiet timeout.
  refs.sessions.on("child_added", (snap) => {
    const v = snap.val();
    if (!v || typeof v.elapsedSeconds !== "number") return;
    const entry = {
      id: snap.key,
      endedAt: v.endedAt,
      elapsedSeconds: v.elapsedSeconds,
      // Records from before categories existed carry `category` instead.
      categoryKey: v.categoryKey || v.category || UNCATEGORIZED_KEY,
      activityVersion: v.activityVersion,
      timeZone: typeof v.timeZone === "string" ? v.timeZone : null,
    };
    if (!log.some((item) => item.id === entry.id)) log.push(entry);
    listeners.forEach((fn) => fn());
  });
  refs.sessions.on("child_changed", (snap) => {
    const v = snap.val();
    if (!v || typeof v.elapsedSeconds !== "number") return;
    const index = log.findIndex((item) => item.id === snap.key);
    if (index < 0) return;
    const previous = log[index];
    const next = {
      id: snap.key,
      endedAt: v.endedAt,
      elapsedSeconds: v.elapsedSeconds,
      categoryKey: v.categoryKey || v.category || UNCATEGORIZED_KEY,
      activityVersion: v.activityVersion,
      timeZone: typeof v.timeZone === "string" ? v.timeZone : previous.timeZone,
    };
    log[index] = next;
    listeners.forEach((fn) => fn());
  });
  refs.sessions.on("value", () => {
    initialLoadComplete = true;
    listeners.forEach((fn) => fn());
  });
  refs.connected.on("value", (snap) => { connected = snap.val() === true; });
}

// An online value read refreshes history immediately before the explicit
// backfill preview. Offline cached history is never treated as authoritative.
export async function refreshCompleteHistory() {
  if (!connected) throw new Error("Connect to the database before previewing history.");
  const snap = await refs.sessions.once("value");
  const values = snap.val() || {};
  const fresh = Object.entries(values).flatMap(([id, v]) => {
    if (!v || !Number.isFinite(v.elapsedSeconds) || v.elapsedSeconds < 0 || !Number.isFinite(v.endedAt)) {
      throw new Error("History contains a session with invalid time data. No backfill was published.");
    }
    return [{
      id,
      endedAt: v.endedAt,
      elapsedSeconds: v.elapsedSeconds,
      categoryKey: v.categoryKey || v.category || UNCATEGORIZED_KEY,
      activityVersion: v.activityVersion,
      timeZone: typeof v.timeZone === "string" ? v.timeZone : null,
    }];
  });
  log.splice(0, log.length, ...fresh);
  initialLoadComplete = true;
  listeners.forEach((fn) => fn());
  return log.slice();
}
