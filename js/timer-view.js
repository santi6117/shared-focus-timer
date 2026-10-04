// The timer card: the big clock, its label, the minutes box, the
// countdown/stopwatch switch and the three buttons. Draws timer.js's
// state; changes it only through timer.js's actions.

import * as timer from "./timer.js";
import { formatClock, formatElapsed } from "./lib/time.js";
import { shownMs } from "./lib/timer-math.js";

let displayEl, stageLabelEl, durationInput, modeBtn, durationRow, capNote;

export function init() {
  displayEl = document.getElementById("timerDisplay");
  stageLabelEl = document.getElementById("stageLabel");
  durationInput = document.getElementById("durationInput");
  modeBtn = document.getElementById("modeToggle");
  durationRow = document.getElementById("durationRow");
  capNote = document.getElementById("capNote");

  durationInput.value = timer.state().countdownDuration / 60000;
  syncSettings();

  document.getElementById("startBtn").addEventListener("click", timer.start);
  document.getElementById("pauseBtn").addEventListener("click", timer.pause);
  document.getElementById("resetBtn").addEventListener("click", timer.reset);
  durationInput.addEventListener("change", (e) => timer.setDurationMinutes(Number(e.target.value)));
  modeBtn.addEventListener("click", () =>
    timer.setMode(timer.state().mode === "stopwatch" ? "countdown" : "stopwatch"));

  timer.on("change", syncSettings);
}

// Neither the duration nor the mode can change mid-run; pause first.
//
// In stopwatch mode the minutes box gives way to a one-line note about the
// cap, in the same row, so switching modes doesn't make the card jump.
// The button names the mode you're IN, with an arrow for the direction
// the clock runs; clicking it switches.
function syncSettings() {
  const t = timer.state();
  const stopwatch = t.mode === "stopwatch";
  durationInput.disabled = t.running;
  modeBtn.disabled = t.running;
  modeBtn.textContent = stopwatch ? "\u2191 Stopwatch" : "\u2193 Countdown";
  modeBtn.setAttribute("aria-pressed", String(stopwatch));
  durationRow.hidden = stopwatch;
  capNote.hidden = !stopwatch;
}

// Called four times a second. 250ms rather than 1000ms because a one-second
// interval fires late and drifts visibly against wall-clock seconds;
// sampling faster and re-deriving from the stored start keeps the displayed
// second honest.
export function render() {
  const t = timer.state();
  if (t.zeroAt !== null && t.mode === "stopwatch") {
    // Stopped at the cap. Holds there rather than counting on: a "+" past
    // 2:00:00 would read as more stopwatch time.
    displayEl.textContent = formatElapsed(t.duration);
    displayEl.classList.add("overrun");
    stageLabelEl.textContent = "Done";
  } else if (t.zeroAt !== null) {
    displayEl.textContent = "+" + formatClock(Date.now() - t.zeroAt);
    displayEl.classList.add("overrun");
    stageLabelEl.textContent = "Done";
  } else if (t.mode === "stopwatch") {
    displayEl.textContent = formatElapsed(shownMs("stopwatch", timer.remaining(), t.duration));
    displayEl.classList.remove("overrun");
    stageLabelEl.textContent = t.running ? "Focusing" : "Focus";
  } else {
    displayEl.textContent = formatClock(timer.remaining());
    displayEl.classList.remove("overrun");
    stageLabelEl.textContent = t.running ? "Focusing" : "Focus";
  }
}
