// The presence pill, top right: whether the OTHER person is working now.
//
// Running: their live countdown (or stopwatch, counting up, marked ↑) and
// category. Otherwise: their status
// with its age ("eating · 40m ago"), or "not working" if they haven't set
// one. A paused timer, a closed tab and an offline laptop all look the
// same; the status is what says more. Read-only — this page never writes
// to their slot.

import { refs, serverNow } from "./firebase.js";
import { THEM } from "./identity.js";
import { DISPLAY_NAME } from "./config.js";
import { formatClock, formatElapsed } from "./lib/time.js";
import { shownMs, STOPWATCH_CAP_MS } from "./lib/timer-math.js";
import { idleText } from "./lib/status.js";

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
    const clock = theirs.mode === "stopwatch"
      ? formatElapsed(shownMs("stopwatch", remainingMs, STOPWATCH_CAP_MS)) + " \u2191"
      : formatClock(remainingMs);
    dot.classList.add("live");
    stateEl.textContent = "focusing" + on + " · " + clock;
  } else {
    dot.classList.remove("live");
    stateEl.textContent = idleText(theirs.status, serverNow());
  }
}
