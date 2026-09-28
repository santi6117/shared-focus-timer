// Pure time helpers: formatting durations and finding calendar boundaries.
// No DOM, no Firebase — imported by the UI modules and by the unit tests.

// "24:59" for the big countdown. Floors, never rounds, so the display reads
// 0:00 only once the time is actually up.
export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return minutes + ":" + seconds;
}

// "45m" / "3h 5m" for the stats totals.
export function formatTotal(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + "m";
  return Math.floor(minutes / 60) + "h " + (minutes % 60) + "m";
}

// Boundaries are built from the local calendar rather than by subtracting
// 86,400,000ms: a DST change makes a day something other than 24 hours, and
// the arithmetic version quietly misfiles sessions for a week.
export function startOfDay(now) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Weeks start Monday.
export function startOfWeek(now) {
  const d = new Date(now);
  const daysSinceMonday = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysSinceMonday).getTime();
}

// "3:05 PM", in the viewer's locale. Used for message read receipts.
export function timeOfDay(ms) {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch (e) {
    return "";
  }
}
