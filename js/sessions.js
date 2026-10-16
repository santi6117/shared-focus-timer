// The session log: writing finished blocks of work to sessions/<me>, and
// holding the whole log in memory for the stats.
//
// Timer records are preserved. Manual corrections append snapshots within a
// record; an active pointer makes undo possible without deleting history.
//
// The whole log is held in memory and re-summed on demand rather than kept
// as running totals in the database: totals would have to be recomputed
// whenever the buckets change (a new week start, a category filter), and
// this app will never hold more than a few thousand tiny records.

import { refs, TIMESTAMP } from "./firebase.js";
import * as timer from "./timer.js";
import * as categories from "./categories.js";
import { readSession, reviseSession } from "./lib/session-edits.js";

const log = [];
const listeners = [];
let initialLoadComplete = false;
let connected = false;

export function all() { return log.filter((entry) => !entry.removed); }
export function history() { return log; }
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

  // A value snapshot applies edits and undo as one coherent log. Firebase
  // still transports deltas; the callback exposes the complete local view.
  refs.sessions.on("value", (snap) => {
    const fresh = Object.entries(snap.val() || {}).map(([id, raw]) => readSession(id, raw)).filter(Boolean);
    log.splice(0, log.length, ...fresh);
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
  const fresh = Object.entries(values).map(([id, raw]) => {
    const entry = readSession(id, raw);
    if (!entry) throw new Error("History contains invalid time data. No backfill was published.");
    return entry;
  });
  log.splice(0, log.length, ...fresh);
  initialLoadComplete = true;
  listeners.forEach((fn) => fn());
  return all().map((entry) => ({ ...entry }));
}

// Editing is online-only: a stale offline form must not overwrite newer work.
// The transaction rechecks its version whenever Firebase retries the callback.
export async function changeSession(id, expectedVersion, change) {
  if (!connected || !initialLoadComplete) throw new Error("Connect and wait for your history before saving changes.");
  let failure = null;
  const result = await refs.sessions.child(id).transaction((raw) => {
    // Firebase may first call with an empty cache; return it unchanged so the
    // server can provide the record before applying an edit.
    if (raw === null) return raw;
    try { return reviseSession(raw, expectedVersion, change, TIMESTAMP); }
    catch (error) { failure = error; return; }
  });
  if (!result.committed || !result.snapshot.exists()) throw failure || new Error("This session is unavailable. Refresh your history and try again.");
}

export function newManualId() { return refs.sessions.push().key; }
export async function addManual(id, work) {
  if (!connected || !initialLoadComplete) throw new Error("Connect and wait for your history before adding work.");
  const result = await refs.sessions.child(id).transaction((raw) => {
    if (raw) return;
    // The hidden base lets Undo also undo an addition. Its original fields
    // and every subsequent snapshot remain in the private record.
    return reviseSession({ ...work, removed: true, source: "manual", activityVersion: 1 }, 0, work, TIMESTAMP);
  });
  if (!result.committed) throw new Error("This work may already be saved. Check your history before adding more.");
}
