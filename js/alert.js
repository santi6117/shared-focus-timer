// End-of-session signals share one explicit acknowledgement: Got it,
// Start, or Reset. A persistent panel and repeating chime cover a missed
// desktop notification; returning to the tab alone is not acknowledgement.
// Audio and notifications remain optional and cannot break the timer.

import * as timer from "./timer.js";
import { hasUnread } from "./messages.js";

let panel, volumeInput;
let volume = 0.75;
let nextChimeAt = 0;
const REPEAT_MS = 15_000;

export function init() {
  panel = document.getElementById("completionPanel");
  volumeInput = document.getElementById("alertVolume");
  try {
    const saved = localStorage.getItem("focus-alert-volume");
    if (saved !== null && Number.isFinite(Number(saved))) {
      volume = Math.max(0, Math.min(1, Number(saved)));
    }
  } catch (e) {}
  volumeInput.value = Math.round(volume * 100);
  updateVolumeLabel();
  volumeInput.addEventListener("input", () => {
    volume = Number(volumeInput.value) / 100;
    updateVolumeLabel();
    try { localStorage.setItem("focus-alert-volume", String(volume)); } catch (e) {}
  });
  document.getElementById("alertPreview").addEventListener("click", () => {
    primeAudio();
    playChime();
  });
  document.getElementById("alertDismiss").addEventListener("click", dismissAlert);
  // Browsers only allow audio that was started by a user gesture, and the
  // chime fires 25 minutes after any gesture. So audio is primed by the
  // first click or keypress anywhere and left running. Any interaction,
  // not just Start, so a refresh mid-session still ends with a sound.
  document.addEventListener("click", primeAudio, { once: true });
  document.addEventListener("keydown", primeAudio, { once: true });

  // Asked on Start rather than on load: prompts without a gesture are
  // increasingly ignored by browsers and reflexively dismissed by people.
  timer.on("start", requestNotifyPermission);

  timer.on("end", () => {
    const t = timer.state();
    document.getElementById("completionDetail").textContent = t.mode === "stopwatch"
      ? "You reached the 2-hour limit. Your session is logged."
      : (t.categoryLabel ? t.categoryLabel + " — " : "") + "Your focus session is logged. Take a breath.";
    panel.hidden = false;
    panel.closest(".timer-card").classList.add("session-complete");
    nextChimeAt = Date.now() + REPEAT_MS;
    playChime();
    showNotification();
    startTitleFlash();
  });
  // Starting or resetting is a response to the alert, however it happened.
  timer.on("start", dismissAlert);
  timer.on("reset", dismissAlert);
}

// Keep the panel non-modal so Start and Reset remain available. No focus
// stealing at completion: an unrelated Enter press must not dismiss it.
function dismissAlert() {
  panel.hidden = true;
  panel.closest(".timer-card").classList.remove("session-complete");
  nextChimeAt = 0;
  stopTitleFlash();
  if (document.activeElement === document.getElementById("alertDismiss")) {
    document.getElementById("startBtn").focus();
  }
}

function updateVolumeLabel() {
  document.getElementById("alertVolumeValue").textContent = volume === 0
    ? "Muted" : Math.round(volume * 100) + "%";
}

// ---- The chime ----
// Synthesised rather than an audio file, so there is no asset to load.
// Two sine tones a fifth apart, the second slightly late, so it reads as a
// soft bell rather than an alarm.
let audioCtx = null;

function primeAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) { audioCtx = null; }
}

// One tone with a 20ms attack and exponential decay. The envelope is not
// polish: an oscillator switched straight on and off jumps from silence to
// full amplitude in one sample, which is audible as a click.
function tone(freq, delaySec, durSec, peak) {
  const t0 = audioCtx.currentTime + delaySec;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t0);
  // Exponential ramps can't reach zero, hence the tiny floor.
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + durSec + 0.05);
}

function playChime() {
  if (!audioCtx || volume === 0) return;   // never primed: stay silent, don't throw
  try {
    if (audioCtx.state === "suspended") audioCtx.resume();
    tone(880.0, 0.00, 0.70, 0.30 * volume);    // A5
    tone(1318.5, 0.16, 0.90, 0.24 * volume);   // E6, overlapping
  } catch (e) {}
}

// ---- The OS notification ----
let notifyAsked = false;
function requestNotifyPermission() {
  if (notifyAsked) return;
  notifyAsked = true;
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    Notification.requestPermission();
  } catch (e) {}
}

function showNotification() {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const t = timer.state();
    const label = t.categoryLabel;
    // The stopwatch only "ends" by hitting its cap, so it says that: you
    // may not have meant to stop, and two hours were logged.
    const capped = t.mode === "stopwatch";
    let body = capped
      ? "Stopwatch stopped at the 2-hour limit" + (label ? " (" + label + ")" : "") + ". Logged."
      : label ? "Finished: " + label : "Your focus session is done.";
    // The session ending is when a held message becomes readable, so the
    // one notification says both rather than raising a second.
    if (hasUnread()) body += "\n✉ A message is waiting for you.";
    // `tag` makes a later notification replace this one instead of
    // stacking a column of them over a long day.
    const n = new Notification(capped ? "2 hours up" : "Time's up", { tag: "focus-timer-end", body });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) {}
}

// ---- The tab title ----
// One worker heartbeat drives the title and reminders. Compare wall-clock
// deadlines rather than counting beats: delayed delivery plays only one
// reminder, never a burst of missed chimes after the computer wakes.
const BASE_TITLE = document.title;
const FLASH_TITLE = "\u23f0 Time's up!";
const FLASH_MS = 1000;
let stopTicker = null;

function startTitleFlash() {
  stopTitleFlash();
  let showingAlert = true;
  document.title = FLASH_TITLE;
  stopTicker = startTicker(() => {
    if (!nextChimeAt) return;
    if (Date.now() >= nextChimeAt) {
      nextChimeAt = Date.now() + REPEAT_MS;
      playChime();
    }
    showingAlert = !showingAlert;
    document.title = showingAlert ? FLASH_TITLE : BASE_TITLE;
  }, FLASH_MS);

}

function stopTitleFlash() {
  if (!stopTicker) return;
  stopTicker();
  stopTicker = null;
  document.title = BASE_TITLE;
}

// Prefer a worker heartbeat for background tabs, with an interval fallback.
// Browser/OS suspension can still delay delivery; this is not a wake alarm.
function startTicker(fn, ms) {
  try {
    const url = URL.createObjectURL(
      new Blob(["setInterval(() => postMessage(0), " + ms + ");"], { type: "text/javascript" })
    );
    const worker = new Worker(url);
    worker.onmessage = fn;
    return () => { worker.terminate(); URL.revokeObjectURL(url); };
  } catch (e) {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
}
