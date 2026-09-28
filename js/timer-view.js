// The timer card: the big clock, its label, the minutes box and the three
// buttons. Draws timer.js's state; changes it only through timer.js's
// actions.

import * as timer from "./timer.js";
import { formatClock } from "./lib/time.js";

let displayEl, stageLabelEl, durationInput;

export function init() {
  displayEl = document.getElementById("timerDisplay");
  stageLabelEl = document.getElementById("stageLabel");
  durationInput = document.getElementById("durationInput");

  durationInput.value = timer.state().duration / 60000;
  syncDurationLock();

  document.getElementById("startBtn").addEventListener("click", timer.start);
  document.getElementById("pauseBtn").addEventListener("click", timer.pause);
  document.getElementById("resetBtn").addEventListener("click", timer.reset);
  durationInput.addEventListener("change", (e) => timer.setDurationMinutes(Number(e.target.value)));

  timer.on("change", syncDurationLock);
}

// The duration can't change mid-run; pause first.
function syncDurationLock() {
  durationInput.disabled = timer.state().running;
}

// Called four times a second. 250ms rather than 1000ms because a one-second
// interval fires late and drifts visibly against wall-clock seconds;
// sampling faster and re-deriving from the stored start keeps the displayed
// second honest.
export function render() {
  const t = timer.state();
  if (t.zeroAt !== null) {
    displayEl.textContent = "+" + formatClock(Date.now() - t.zeroAt);
    displayEl.classList.add("overrun");
    stageLabelEl.textContent = "Done";
  } else {
    displayEl.textContent = formatClock(timer.remaining());
    displayEl.classList.remove("overrun");
    stageLabelEl.textContent = t.running ? "Focusing" : "Focus";
  }
}
