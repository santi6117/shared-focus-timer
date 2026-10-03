// Today's split, both directions: publishing mine to room/<me>/today, and
// holding theirs from room/<them>/today for the breakdown widget's flip.
//
// A published summary rather than letting each person read the other's
// sessions/ and categories/. History stays private (only today's totals
// ever leave), the security rules don't change since room/ is already
// readable by both, and "today" is computed on the owner's own calendar,
// so it stays correct if the two of you are in different timezones.
// The shape and its validation are in lib/categories.js.
//
// Laptop only: the phone logs no sessions, so it has nothing to publish and
// no breakdown widget to show theirs in.

import { refs, serverNow } from "./firebase.js";
import * as sessions from "./sessions.js";
import * as categories from "./categories.js";
import { breakdown, shareableToday, readSharedToday } from "./lib/categories.js";
import { startOfDay, endOfDay } from "./lib/time.js";

// The session log arrives one record at a time on load, so publishing on
// every change would write a run of partial days. Waiting for a quiet
// second publishes once, after the burst.
const SETTLE_MS = 1000;

let theirsRaw = null;
let lastPublished = null;
let pending = null;
const listeners = [];

export function onChange(fn) { listeners.push(fn); }

// Theirs, or null when they've logged nothing today. Checked against the
// clock on every call, so their day ends at their midnight without them
// having to publish anything.
export function theirs() {
  return readSharedToday(theirsRaw, serverNow());
}

export function init() {
  const schedule = () => {
    clearTimeout(pending);
    pending = setTimeout(() => categories.whenReady(publish), SETTLE_MS);
  };
  // Categories too: a label or colour first appears there, a moment after
  // the session that introduced it.
  sessions.onChange(schedule);
  categories.onChange(schedule);

  refs.theirs.child("today").on("value", (snap) => {
    theirsRaw = snap.val();
    listeners.forEach((fn) => fn());
  });
}

// set() on the child, not the whole slot: the timer and status live beside
// it in room/<me>. Skipped when nothing changed, since categories.onChange
// also fires for chip-ordering updates that don't move today's numbers.
function publish() {
  const now = Date.now();
  const log = sessions.all();
  if (!log.length) return;
  const summary = shareableToday(
    breakdown(log, startOfDay(now)), categories.labelFor, categories.colorFor, endOfDay(now));
  const json = JSON.stringify(summary);
  if (json === lastPublished) return;
  lastPublished = json;
  refs.mine.child("today").set(summary);
}
