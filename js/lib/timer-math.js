// The timer's arithmetic, kept pure so it can be tested without a browser.
//
// The whole design rests on storing a FACT and deriving everything else:
// "this run started at T with R milliseconds left", never a variable
// decremented once a second. That is what makes the countdown survive a
// refresh and what makes it syncable: only transitions cross the network,
// the ticking is local.
//
// Timer state, all times in local milliseconds:
//   duration          fixed session length
//   remainingAtStart  time left as of `startedAt` (NOT the fixed setting,
//                     which is what makes pause/resume correct for the peer)
//   startedAt         start of the current run, or null
//   running           counting down right now
//   logged            this run's time has already been written to the log;
//                     guards the paths that can overlap (zero, then Reset)
//   zeroAt            when this run crossed zero; non-null means the display
//                     is in the count-up cue
//   categoryLabel     free text exactly as typed; "" is uncategorized
//   lastTickAt        heartbeat while running. Its age at page load is how
//                     long the browser was dead — see planRecovery()

export const HEARTBEAT_MS = 5000;
export const STALE_MS = 15000;

// A start that lasted a couple of seconds is a misclick, not work. Nothing
// shorter than this is written to the session log.
export const MIN_LOGGABLE_MS = 5000;

export function defaultTimer() {
  return {
    duration: 1500000,
    remainingAtStart: 1500000,
    startedAt: null,
    running: false,
    logged: false,
    zeroAt: null,
    categoryLabel: "",
    lastTickAt: null,
  };
}

// Merged over the default rather than trusted as-is: state saved by an older
// version of the app is missing newer fields, and a missing `logged` would
// silently re-log sessions.
export function parseTimer(raw) {
  if (!raw) return defaultTimer();
  try { return Object.assign(defaultTimer(), JSON.parse(raw)); }
  catch (e) { return defaultTimer(); }
}

export function remainingMs(t, now) {
  return t.running ? t.remainingAtStart - (now - t.startedAt) : t.remainingAtStart;
}

// How much of the current run has actually been worked. Clamped at both
// ends: an overrun run has negative remaining time, which would otherwise
// report more elapsed time than the session was long — a timer left running
// overnight would log eight hours of "focus".
export function elapsedMs(t, now) {
  const left = Math.min(Math.max(remainingMs(t, now), 0), t.duration);
  return t.duration - left;
}

// A page that loads with `running: true` did not exit cleanly. Two very
// different situations leave identical storage:
//
//   an ordinary refresh   gone for a moment; the countdown must survive F5
//   a crash or reboot     gone for minutes or hours, none of which was work
//
// The heartbeat separates them. Past STALE_MS, the run is ended at the last
// moment a browser is known to have been alive, capped at the moment it
// would have hit zero.
//
// Rejected: logging the full duration. A machine that died five minutes
// into a 45-minute timer would record 45 minutes of focus — over-counting,
// the same lie as the under-counting this exists to stop.
//
// Returns null when there is nothing to recover, else { workedMs }.
export function planRecovery(t, now) {
  if (!t.running || t.startedAt === null) return null;
  // No heartbeat at all means state saved before the field existed; the
  // start time is the best floor.
  const diedAt = t.lastTickAt || t.startedAt;
  if (now - diedAt < STALE_MS) return null;
  const zeroTime = t.startedAt + t.remainingAtStart;
  const endedAt = Math.min(diedAt, zeroTime);
  const workedMs = Math.min(Math.max(endedAt - t.startedAt, 0), t.duration);
  return { workedMs };
}
