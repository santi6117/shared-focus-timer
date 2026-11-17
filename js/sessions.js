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
import { stageSessionTarget, stageSessionTargets } from "./progress-store.js";

const log = [];
const listeners = [];
let initialLoadComplete = false;
let connected = false;
let ownerUid;
let flushing = false;
let retryRequested = false;
let watching = false;

export function all() { return log.filter((entry) => !entry.removed); }
export function history() { return log; }
export function onChange(fn) { listeners.push(fn); }
export function isInitialLoadComplete() { return initialLoadComplete; }

async function write({ id, ms, categoryLabel, timeZone, target }) {
  const key = categories.keyFor(categoryLabel);
  const data = {
    endedAt: TIMESTAMP,
    elapsedSeconds: Math.round(ms / 1000),
    categoryKey: key,
    timeZone,
    activityVersion: 1,
  };
  // Create only once. Retrying after acknowledgement loss must also preserve
  // time-management edits that may have happened since the original write.
  const result = await refs.sessions.child(id).transaction(
    (current) => current === null ? data : undefined, undefined, false,
  );
  if (result.committed) categories.recordUse(key, categoryLabel);
  if (target?.uid === ownerUid) {
    const link = { columnId: target.columnId };
    if (target.taskId) link.taskId = target.taskId;
    // This is private even on deployments where legacy session grants are
    // broader. A retry leaves the original attribution and any note intact.
    await refs.progress.child("links/" + id).transaction(
      (current) => current?.columnId ? undefined : { ...current, ...link }, undefined, false,
    );
  }
}

async function flushPending() {
  if (!connected) return;
  if (flushing) {
    retryRequested = true;
    return;
  }
  flushing = true;
  try {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(timer.PENDING_PREFIX));
    const results = await Promise.allSettled(keys.map(async (key) => {
      const work = JSON.parse(localStorage.getItem(key));
      if (work?.uid !== ownerUid) return;
      await write(work);
      localStorage.removeItem(key);
    }));
    const failure = results.find((result) => result.status === "rejected");
    if (failure) console.error("Session sync will retry:", failure.reason);
    window.dispatchEvent(new CustomEvent("sft:sessionsync", { detail: { failed: Boolean(failure) } }));
  } finally {
    flushing = false;
    if (retryRequested) {
      retryRequested = false;
      flushPending();
    }
  }
}

export function init(uid) {
  ownerUid = uid;
  const flush = () => categories.whenReady(flushPending);
  timer.on("session", flush);
  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith(timer.PENDING_PREFIX) && event.newValue) flush();
  });
  setInterval(() => {
    if (Object.keys(localStorage).some((key) => key.startsWith(timer.PENDING_PREFIX))) flush();
  }, 30_000);
  watchHistory();
  refs.connected.on("value", (snap) => {
    connected = snap.val() === true;
    if (connected) flush();
  });
}

export function watchHistory() {
  if (watching) return;
  watching = true;
  // A value snapshot applies edits and undo as one coherent log. Firebase
  // still transports deltas; the callback exposes the complete local view.
  refs.sessions.on("value", (snap) => {
    const fresh = Object.entries(snap.val() || {}).map(([id, raw]) => readSession(id, raw)).filter(Boolean);
    log.splice(0, log.length, ...fresh);
    initialLoadComplete = true;
    listeners.forEach((fn) => fn());
  });
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
export async function changeSession(id, expectedVersion, change, target) {
  if (!connected || !initialLoadComplete) throw new Error("Connect and wait for your history before saving changes.");
  if (target !== undefined) change = { ...change, progressRevision: await stageSessionTarget(id, target) };
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

// The session-log transaction publishes every revision together. Staged
// private links are inert until a session points to them.
export async function changeSessionCategories(entries, { undo = false } = {}) {
  if (!connected || !initialLoadComplete) throw new Error("Connect and wait for your history before saving changes.");
  const targets = undo ? [] : entries.filter(({ target }) => target !== undefined);
  const revisions = targets.length ? await stageSessionTargets(targets) : new Map();
  let failure;
  const result = await refs.sessions.transaction((raw) => {
    if (raw === null) return raw;
    const next = { ...raw };
    try {
      for (const { id, editVersion, categoryKey } of entries) {
        const entry = readSession(id, raw[id]);
        if (!entry || entry.removed) throw new Error("A session is no longer available.");
        const progressRevision = revisions.get(id);
        const change = undo ? "undo" : {
          endedAt: entry.endedAt, elapsedSeconds: entry.elapsedSeconds, timeZone: entry.timeZone,
          categoryKey, removed: false, ...(progressRevision && { progressRevision }),
        };
        next[id] = reviseSession(raw[id], editVersion, change, TIMESTAMP);
      }
      return next;
    } catch (error) {
      failure = error;
      return;
    }
  }, undefined, false);
  if (!result.committed || !result.snapshot.exists()) {
    throw failure || new Error("The transfer could not be saved. Review your history and try again.");
  }
}

export function newManualId() { return refs.sessions.push().key; }
export async function addManual(id, work, target) {
  if (!connected || !initialLoadComplete) throw new Error("Connect and wait for your history before adding work.");
  if (target) work = { ...work, progressRevision: await stageSessionTarget(id, target) };
  const result = await refs.sessions.child(id).transaction((raw) => {
    if (raw) return;
    // The hidden base lets Undo also undo an addition. Its original fields
    // and every subsequent snapshot remain in the private record.
    const { progressRevision, ...base } = work;
    return reviseSession({ ...base, removed: true, source: "manual", activityVersion: 1 }, 0, work, TIMESTAMP);
  });
  if (!result.committed) throw new Error("This work may already be saved. Check your history before adding more.");
}
