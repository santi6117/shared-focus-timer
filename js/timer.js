// Your own timer: its state, the controls that change it, and publishing it
// to room/<me> for the other person's presence pill. No DOM — timer-view.js
// draws it.
//
// Other modules never reach into this one to find out what happened.
// It announces transitions, and they listen:
//
//   "change"   after every state transition (start, pause, reset, zero,
//              duration change, recovery)
//   "start"    the Start action, fired inside the click, so listeners may
//              do things browsers only allow during a user gesture
//   "end"      the run reached zero — fires exactly once per run
//   "session"  a block of work should be logged: { ms, categoryLabel }
//
// Events rather than direct calls because the old single-file version had
// the timer call into messages, stats and the alert by name, which is what
// made the order of declarations matter. A listener that throws is also
// reported without interrupting the timer, since EventTarget isolates each
// listener.

import { refs, TIMESTAMP } from "./firebase.js";
import { ME } from "./identity.js";
import {
  HEARTBEAT_MS, MIN_LOGGABLE_MS, parseTimer, remainingMs, elapsedMs, planRecovery,
} from "./lib/timer-math.js";

// Namespaced by role: localStorage is per browser, not per tab, so two test
// windows on one machine (?me=santi, ?me=kristina) would otherwise share one
// timer.
const STORAGE_KEY = "timerData:" + ME;

let timer = null;
const events = new EventTarget();

export function on(type, fn) {
  events.addEventListener(type, (e) => fn(e.detail));
}
function emit(type, detail) {
  events.dispatchEvent(new CustomEvent(type, { detail }));
}

export function init() {
  timer = parseTimer(localStorage.getItem(STORAGE_KEY));
}

// Read-only view for other modules. They change the timer only through the
// actions below.
export function state() { return timer; }
export function remaining() { return remainingMs(timer, Date.now()); }

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(timer)); }

// ---- Publishing to room/<me> ----
// In SECONDS; the local state stays in milliseconds and converts only here.
//
// Sends `remainingAtStart`, not the fixed duration. Sending the duration
// with a fresh startedAt is only right for a run that was never paused:
// resume at 24:00 and the peer would compute "25 minutes minus time since
// resume", erasing the elapsed minute from their view.
//
// The category goes out as its LABEL, not its key, so the other person's
// page can render it without reading this person's category vocabulary.
//
// update(), not set(): room/<me> also holds the status, which a phone may
// have set, and set() would wipe it. Every timer field is written each
// time, so nothing stale survives.
function publish(running, startedAtValue) {
  refs.mine.update({
    running: running,
    startedAt: startedAtValue,
    remainingAtStart: Math.round(Math.max(0, timer.remainingAtStart) / 1000),
    category: timer.categoryLabel ? timer.categoryLabel.trim() : null,
  });
}

// update(), not set(): set() would re-stamp startedAt and restart the
// peer's view of the countdown from the top.
function publishCategory() {
  refs.mine.update({ category: timer.categoryLabel ? timer.categoryLabel.trim() : null });
}

// An onDisconnect instruction is bound to one connection and doesn't survive
// a reconnect, so it is re-armed every time the connection comes back.
// Without that, the first wifi drop would clear presence and the second
// would not. This is what makes a closed tab, a sleeping laptop and lost
// wifi all read as "not working" to the other person.
//
// Called by main.js on laptops only. A phone never runs the timer, and it
// disconnects every time its screen locks.
export function armDisconnect() {
  refs.connected.on("value", (snap) => {
    if (snap.val() === true) refs.mine.onDisconnect().update({ running: false });
  });
}

// ---- Logging ----
// Every exit from a run funnels through here, so there is exactly one place
// that decides whether time gets counted: Reset, a duration change, and the
// zero crossing.
function flushUnlogged() {
  if (timer.logged) return;
  logWork(elapsedMs(timer, Date.now()));
  timer.logged = true;
}

function logWork(ms) {
  if (ms < MIN_LOGGABLE_MS) return;
  emit("session", { ms, categoryLabel: timer.categoryLabel || "" });
}

// ---- Waking up on time ----
// The render loop normally notices the zero crossing, but browsers throttle
// timers hard in a hidden tab — exactly when the end-of-session alert
// matters. One long setTimeout aimed at the zero crossing isn't throttled
// the same way. It only calls tick(), so reaching zero still has exactly
// one code path.
let alarmTimeout = null;
function clearAlarm() {
  clearTimeout(alarmTimeout);
  alarmTimeout = null;
}
export function scheduleAlarm() {
  clearAlarm();
  if (!timer.running) return;
  alarmTimeout = setTimeout(tick, Math.max(0, remaining()) + 50);
}

// ---- Actions ----
export function start() {
  if (timer.running) return;
  // Starting out of the count-up rolls into a fresh session. That run was
  // logged when it crossed zero, so Reset isn't required in between.
  if (timer.zeroAt !== null || timer.remainingAtStart <= 0) {
    timer.remainingAtStart = timer.duration;
    timer.zeroAt = null;
    timer.logged = false;
  }
  timer.startedAt = Date.now();
  timer.running = true;
  timer.lastTickAt = Date.now();
  save();
  // The server stamps the start so both laptops measure from one origin.
  publish(true, TIMESTAMP);
  scheduleAlarm();
  emit("start");
  emit("change");
}

export function pause() {
  if (!timer.running) return;
  clearAlarm();
  timer.remainingAtStart = Math.max(0, remaining());
  timer.running = false;
  timer.startedAt = null;
  save();
  publish(false, null);
  emit("change");
}

export function reset() {
  clearAlarm();
  flushUnlogged();
  timer.startedAt = null;
  timer.remainingAtStart = timer.duration;
  timer.running = false;
  timer.logged = false;
  timer.zeroAt = null;
  save();
  publish(false, null);
  emit("reset");
  emit("change");
}

// Locked while running. Changing it also ends the paused run, and logs its
// time first: without that, editing the minutes box silently threw away
// real work.
export function setDurationMinutes(minutes) {
  if (timer.running) return;
  if (!Number.isFinite(minutes) || minutes < 1) return;
  clearAlarm();
  flushUnlogged();
  timer.duration = minutes * 60000;
  timer.remainingAtStart = timer.duration;
  timer.startedAt = null;
  timer.zeroAt = null;
  timer.logged = false;
  save();
  publish(false, null);
  emit("change");
}

// The category is not part of the timing math, so it can change at any
// time, mid-session included. Published separately (and only on commit,
// not per keystroke) via publishCategoryIfRunning().
export function setCategoryLabel(label) {
  timer.categoryLabel = label;
  save();
}
export function publishCategoryIfRunning() {
  if (timer.running) publishCategory();
}

// Reaching zero ends the run: it stops, it logs the full duration, and
// presence flips to "not working" so the other person isn't shown a session
// that's over. The display then counts upward in the accent colour, which
// still says something if you looked away: how long ago you finished.
function completeAtZero() {
  timer.zeroAt = timer.startedAt + timer.remainingAtStart;
  timer.remainingAtStart = 0;
  timer.running = false;
  timer.startedAt = null;
  flushUnlogged();
  save();
  publish(false, null);
  clearAlarm();
  // The only place "end" fires, so one alert per session holds by
  // construction rather than by a flag.
  emit("end");
  emit("change");
}

// Called four times a second by the render loop, and by the alarm.
export function tick() {
  if (timer.running && remaining() <= 0) completeAtZero();

  // Heartbeat for planRecovery(). Every 5s rather than every tick: save()
  // serialises the whole object, and four writes a second for hours is
  // churn nobody needs. Five seconds of crash accuracy sits under the
  // noise floor anyway.
  if (timer.running && Date.now() - (timer.lastTickAt || 0) >= HEARTBEAT_MS) {
    timer.lastTickAt = Date.now();
    save();
  }
}

// Called once at startup, before the first render. A run interrupted by a
// crash or reboot is ended at the last heartbeat and its real elapsed time
// is logged. It resets to a clean, startable state rather than the
// count-up cue: "you just finished" is noise hours after a reboot.
export function recoverInterruptedRun() {
  const plan = planRecovery(timer, Date.now());
  if (!plan) return;
  timer.running = false;
  timer.startedAt = null;
  timer.lastTickAt = null;
  timer.remainingAtStart = timer.duration;
  timer.zeroAt = null;
  timer.logged = false;
  save();
  publish(false, null);
  logWork(plan.workedMs);
  emit("change");
}
