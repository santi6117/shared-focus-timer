// The end-of-session alert. When a run reaches zero, three signals fire
// together, chosen because they fail in different ways and so cover for
// each other:
//
//   chime            works with the tab buried; useless with the volume down
//   OS notification  works with the volume down; needs permission and a
//                    real http(s) address (browsers refuse it on file://)
//   tab title        needs no permission and no audio; blinks until you
//                    come back, so it's there whenever you glance at the
//                    tab bar
//
// Overrun time is never logged, so without this the minutes between the
// real end and the moment you notice are simply lost.
//
// Every path here is wrapped so that a failure degrades to silence. Audio
// and notifications are a nicety and must never break the timer.

import * as timer from "./timer.js";
import { hasUnread } from "./messages.js";

export function init() {
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
    playChime();
    showNotification();
    startTitleFlash();
  });
  // Starting or resetting is a response to the alert, however it happened.
  timer.on("start", stopTitleFlash);
  timer.on("reset", stopTitleFlash);
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
  if (!audioCtx) return;   // never primed: stay silent, don't throw
  try {
    if (audioCtx.state === "suspended") audioCtx.resume();
    tone(880.0, 0.00, 0.70, 0.22);    // A5
    tone(1318.5, 0.16, 0.90, 0.18);   // E6, overlapping
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
// Alternates between "⏰ Time's up!" and the normal title every second, with
// no time limit, until the person shows any sign of being back:
//
//   returning to the tab or window   visibilitychange / focus
//   any click or keypress on the page, which covers the case where the page
//   was already in front when the session ended, so focus never changes
//   Start or Reset                   via the timer's events
const BASE_TITLE = document.title;
const FLASH_TITLE = "\u23f0 Time's up!";
const FLASH_MS = 1000;
let stopTicker = null;

function startTitleFlash() {
  stopTitleFlash();
  let showingAlert = true;
  document.title = FLASH_TITLE;
  stopTicker = startTicker(() => {
    showingAlert = !showingAlert;
    document.title = showingAlert ? FLASH_TITLE : BASE_TITLE;
  }, FLASH_MS);

  window.addEventListener("focus", stopTitleFlash);
  document.addEventListener("visibilitychange", stopIfVisible);
  // Capture phase, so a click that some widget stops from bubbling still
  // counts.
  document.addEventListener("pointerdown", stopTitleFlash, true);
  document.addEventListener("keydown", stopTitleFlash, true);
}

function stopIfVisible() {
  if (document.visibilityState === "visible") stopTitleFlash();
}

function stopTitleFlash() {
  if (!stopTicker) return;
  stopTicker();
  stopTicker = null;
  document.title = BASE_TITLE;
  window.removeEventListener("focus", stopTitleFlash);
  document.removeEventListener("visibilitychange", stopIfVisible);
  document.removeEventListener("pointerdown", stopTitleFlash, true);
  document.removeEventListener("keydown", stopTitleFlash, true);
}

// A steady beat that survives a hidden tab. After five minutes in the
// background, Chrome runs a page's repeating timers at most once a minute,
// which would turn a one-second blink into a once-a-minute flip, and a
// hidden tab is exactly when the blink matters. Timers inside a Web Worker
// aren't under that rule, so a two-line worker keeps the beat and the page
// just flips the title on each message. Falls back to a plain interval if
// a worker can't be created. Returns a function that stops it.
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
