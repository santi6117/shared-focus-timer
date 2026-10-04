// The timer card on a phone: your laptop's timer, read-only.
//
// Draws from room/<me> — what the laptop published — instead of the local
// timer, using the same server-clock maths the presence pill uses for the
// other person (the laptop stamped startedAt with the server's clock).
// timer-view.js does the laptop's version of this card; the two never run
// on the same page.

import { serverNow } from "./firebase.js";
import * as ownRoom from "./own-room.js";
import { formatClock, formatElapsed } from "./lib/time.js";
import { shownMs, STOPWATCH_CAP_MS } from "./lib/timer-math.js";

// Your laptop's clock as it should read: time left for a countdown, time
// used for a stopwatch.
function clockText(r, leftMs) {
  return r.mode === "stopwatch"
    ? formatElapsed(shownMs("stopwatch", leftMs, STOPWATCH_CAP_MS))
    : formatClock(leftMs);
}

let displayEl, stageLabelEl, noteEl;

export function init() {
  displayEl = document.getElementById("timerDisplay");
  stageLabelEl = document.getElementById("stageLabel");
  noteEl = document.getElementById("remoteNote");
}

// Called four times a second.
export function render() {
  const r = ownRoom.get();
  const leftMs = (r.remainingAtStart || 0) * 1000;
  if (r.running && r.startedAt) {
    displayEl.textContent = clockText(r, leftMs - (serverNow() - r.startedAt));
    stageLabelEl.textContent = "Focusing";
    noteEl.textContent = "on your laptop" + (r.category ? " · " + r.category : "");
  } else {
    displayEl.textContent = r.remainingAtStart ? clockText(r, leftMs) : "—";
    stageLabelEl.textContent = "Focus";
    noteEl.textContent = "timers run on your laptop";
  }
}
