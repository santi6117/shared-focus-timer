// The presence pill, top right: whether the OTHER person is working now.
//
// Two states only, on purpose: their timer is running (with its live
// countdown and category), or "not working". A paused timer, a closed tab
// and an offline laptop all look the same. Read-only — this page never
// writes to their slot.

import { refs, serverNow } from "./firebase.js";
import { THEM } from "./identity.js";
import { DISPLAY_NAME } from "./config.js";
import { formatClock } from "./lib/time.js";

let theirs = { running: false, startedAt: null, remainingAtStart: 0 };
let dot, stateEl;

export function init() {
  dot = document.getElementById("presenceDot");
  stateEl = document.getElementById("presenceState");
  document.getElementById("presenceName").textContent = DISPLAY_NAME[THEM];

  refs.theirs.on("value", (snap) => {
    theirs = snap.val() || { running: false, startedAt: null, remainingAtStart: 0 };
  });
}

// Called from the render loop, since a running countdown changes every
// second. Their startedAt is a server timestamp, so the remaining time is
// measured against serverNow(), not this laptop's clock.
export function render() {
  if (theirs.running && theirs.startedAt) {
    const remainingMs = theirs.remainingAtStart * 1000 - (serverNow() - theirs.startedAt);
    const on = theirs.category ? " on " + theirs.category : "";
    dot.classList.add("live");
    stateEl.textContent = "focusing" + on + " · " + formatClock(remainingMs);
  } else {
    dot.classList.remove("live");
    stateEl.textContent = "not working";
  }
}
