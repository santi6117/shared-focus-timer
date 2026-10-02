// This person's own live state, as published to room/<me>: whether their
// timer is running (on whichever laptop runs it) and their status.
//
// Exists for the phone. On a laptop the timer module already knows whether
// the timer is running; on a phone the only source is the database, since
// the timer isn't running there. The status box asks here, so the same
// question gets the right answer on both.

import { refs } from "./firebase.js";
import { REMOTE } from "./device.js";
import * as timer from "./timer.js";

let room = {};
const listeners = [];

export function init() {
  refs.mine.on("value", (snap) => {
    room = snap.val() || {};
    listeners.forEach((fn) => fn());
  });
}

export function onChange(fn) { listeners.push(fn); }

// What's in room/<me> right now: { running, startedAt, remainingAtStart,
// category, status }.
export function get() { return room; }

// On a laptop, the local timer rather than its published copy: it is the
// source the published copy comes from, and it is right even while the
// write is still travelling.
export function running() {
  return REMOTE ? room.running === true : timer.state().running;
}
