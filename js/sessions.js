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

export function all() { return log; }
export function onChange(fn) { listeners.push(fn); }

function write({ ms, categoryLabel }) {
  const key = categories.keyFor(categoryLabel);
  refs.sessions.push({
    endedAt: TIMESTAMP,
    elapsedSeconds: Math.round(ms / 1000),
    categoryKey: key,
  });
  categories.recordUse(key, categoryLabel);
}

export function init() {
  timer.on("session", (work) => categories.whenReady(() => write(work)));

  // child_added fires once per existing record on attach, then once per new
  // one: both the initial load and the live update, never re-downloading
  // history. endedAt first arrives as Firebase's local estimate of the
  // server clock; the estimate can't realistically move a session across a
  // day boundary, so the correction isn't listened for.
  refs.sessions.on("child_added", (snap) => {
    const v = snap.val();
    if (!v || typeof v.elapsedSeconds !== "number") return;
    log.push({
      endedAt: v.endedAt || Date.now(),
      elapsedSeconds: v.elapsedSeconds,
      // Records from before categories existed carry `category` instead.
      categoryKey: v.categoryKey || v.category || UNCATEGORIZED_KEY,
    });
    listeners.forEach((fn) => fn());
  });
}
