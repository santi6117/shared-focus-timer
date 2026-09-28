// The end-of-session alert. When a run reaches zero, three signals fire
// together, chosen because they fail in different ways and so cover for
// each other:
//
//   chime            works with the tab buried; useless with the volume down
//   OS notification  works with the volume down; needs permission and a
//                    real http(s) address (browsers refuse it on file://)
//   tab title        needs no permission and no audio; only helps if you
//                    look at the tab bar
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
    flashTitle();
  });
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
    const label = timer.state().categoryLabel;
    let body = label ? "Finished: " + label : "Your focus session is done.";
    // The session ending is when a held message becomes readable, so the
    // one notification says both rather than raising a second.
    if (hasUnread()) body += "\n✉ A message is waiting for you.";
    // `tag` makes a later notification replace this one instead of
    // stacking a column of them over a long day.
    const n = new Notification("Time's up", { tag: "focus-timer-end", body });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) {}
}

// ---- The tab title ----
// Flashes once and restores itself after 20 seconds, or the moment the
// window regains focus, whichever is first.
const BASE_TITLE = document.title;
let titleTimeout = null;

function restoreTitle() {
  clearTimeout(titleTimeout);
  titleTimeout = null;
  document.title = BASE_TITLE;
}

function flashTitle() {
  document.title = "⏰ Time's up!";
  clearTimeout(titleTimeout);
  titleTimeout = setTimeout(restoreTitle, 20000);
  window.addEventListener("focus", restoreTitle, { once: true });
}
