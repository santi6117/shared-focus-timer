// The application's visible views. This module only changes which existing
// DOM section is shown; the timer and feature modules are initialized once.

import { REMOTE } from "./device.js";
import * as timer from "./timer.js";
import { formatClock, formatElapsed } from "./lib/time.js";
import { shownMs } from "./lib/timer-math.js";

let views, activeView, timerStatus;

// Hashes keep deep links and browser history native while leaving identity,
// device and wallpaper query parameters untouched.
function routeFromLocation() {
  const route = window.location.hash.slice(1);
  if (!route || route === "timer" || route === "progress" || (!REMOTE && route === "dashboard")) {
    return route || "timer";
  }
  const url = new URL(window.location.href);
  url.hash = "timer";
  history.replaceState(history.state, "", url);
  return "timer";
}

// Apply visibility to the already-mounted sections, then tell modules
// that depend on actual visibility (notably message receipts) about the route.
function applyRoute({ focus = false } = {}) {
  const next = routeFromLocation();
  if (next === activeView) return;
  activeView = next;
  for (const [name, view] of Object.entries(views)) view.hidden = name !== next;
  if (focus) {
    document.getElementById(next + "Heading").focus({ preventScroll: true });
  }
  window.dispatchEvent(new CustomEvent("sft:viewchange", { detail: { view: next } }));
}

export function init() {
  views = Object.fromEntries(["timer", "dashboard", "progress"]
    .map((name) => [name, document.getElementById(name + "View")]));
  timerStatus = document.getElementById("dashboardTimerStatus");
  const initial = routeFromLocation();
  activeView = null;
  applyRoute({ focus: initial !== "timer" });
  if (initial === "timer" && !window.location.hash && !REMOTE) {
    const url = new URL(window.location.href);
    url.hash = "timer";
    history.replaceState(history.state, "", url);
  }
  window.addEventListener("hashchange", () => applyRoute({ focus: true }));
  document.addEventListener("visibilitychange", () => {
    window.dispatchEvent(new CustomEvent("sft:documentvisibility"));
  });
  render();
}

// Keep the compact dashboard status derived from the timer's wall-clock
// state, so switching views never pauses or restarts the countdown.
export function render() {
  if (!timerStatus) return;
  const t = timer.state();
  let text;
  if (t.mode === "stopwatch") {
    const elapsed = shownMs("stopwatch", timer.remaining(), t.duration);
    text = t.zeroAt !== null
      ? "Complete · " + formatElapsed(t.duration)
      : (t.running ? "Stopwatch · " : "Paused · ") + formatElapsed(elapsed);
  } else if (t.zeroAt !== null) {
    text = "Complete · +" + formatClock(Date.now() - t.zeroAt);
  } else {
    const left = formatClock(timer.remaining());
    text = t.running ? "Focusing · " + left + " left"
      : t.remainingAtStart < t.duration ? "Paused · " + left + " left"
      : "Ready · " + left;
  }
  // Separate the state label from the clock so only the label has accent color.
  const [label, clock] = text.split(" · ");
  let labelEl = timerStatus.querySelector(".timer-status-label");
  let clockEl = timerStatus.querySelector(".timer-status-clock");
  if (!labelEl || !clockEl) {
    labelEl = document.createElement("span");
    labelEl.className = "timer-status-label";
    clockEl = document.createElement("span");
    clockEl.className = "timer-status-clock";
    timerStatus.replaceChildren(labelEl, document.createTextNode(" · "), clockEl);
  }
  if (labelEl.textContent !== label) labelEl.textContent = label;
  if (clockEl.textContent !== clock) clockEl.textContent = clock;
}
