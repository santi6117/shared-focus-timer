// Owner-written daily summaries for the shared calendar. The partner reads
// these summaries only; session records and category labels remain private.

import { refs, TIMESTAMP } from "./firebase.js";
import { ME, THEM } from "./identity.js";
import { DISPLAY_NAME } from "./config.js";
import * as sessions from "./sessions.js";
import { formatTotal } from "./lib/time.js";
import { localDayKey, monthCells, monthCoveredDays, monthKey, monthTotal, readDailySummary } from "./lib/activity-calendar.js";

const $ = (id) => document.getElementById(id);
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
let mine = {}, theirs = {};
let selectedMonth = "";
let preview = null;
let backfillMeta = null;
let theirsClock = null;
let connected = false;

function zoneList(value) {
  if (Array.isArray(value)) return value.filter((zone) => typeof zone === "string");
  if (value && typeof value === "object") return Object.values(value).filter((zone) => typeof zone === "string");
  return [];
}
function blankSummary(date, zone, coverage) {
  return {
    date, totalSeconds: 0, sessionCount: 0, timeZone: zone,
    timeZones: [zone], updatedAt: TIMESTAMP,
    coverage, applied: {},
  };
}

async function mutateDay(date, zone, id, change, coverage) {
  const ref = refs.activity.child(ME).child("days").child(date);
  const result = await ref.transaction((current) => {
    if (id && change < 0 && (!current || !current.applied || !current.applied[id])) return;
    const day = current && typeof current === "object" ? current : blankSummary(date, zone, coverage);
    day.date = date;
    day.totalSeconds = Number.isInteger(day.totalSeconds) ? day.totalSeconds : 0;
    day.sessionCount = Number.isInteger(day.sessionCount) ? day.sessionCount : 0;
    day.applied = day.applied && typeof day.applied === "object" ? day.applied : {};
    day.timeZones = zoneList(day.timeZones);
    if (!day.timeZones.includes(zone)) day.timeZones.push(zone);
    day.timeZone = zone;
    day.coverage = coverage === "backfilled" ? "backfilled" : (day.coverage || "new-sessions");

    if (id && change > 0 && !day.applied[id]) {
      day.applied[id] = true;
      day.totalSeconds += change;
      day.sessionCount += 1;
    } else if (id && change < 0 && day.applied[id]) {
      delete day.applied[id];
      day.totalSeconds = Math.max(0, day.totalSeconds + change);
      day.sessionCount = Math.max(0, day.sessionCount - 1);
    } else if (id && change === 0 && !day.applied[id]) {
      day.applied[id] = true;
      day.sessionCount += 1;
    }
    day.updatedAt = TIMESTAMP;
    return day;
  });
  if (!result.committed && !(id && change < 0)) throw new Error("Could not save the daily activity summary.");
}

async function publishSession(id, current, previous) {
  const zone = current.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const date = localDayKey(current.endedAt, zone);
  const seconds = Math.max(0, Math.round(current.elapsedSeconds));
  if (!previous) {
    await mutateDay(date, zone, id, seconds, "new-sessions");
    return;
  }
  // Legacy entries are never silently published or re-attributed. They stay
  // unknown until the explicit, timezone-based backfill review.
  const oldZone = previous.timeZone || backfillMeta?.timeZone;
  if (!oldZone) return;
  const newZone = current.timeZone || oldZone;
  const oldDate = localDayKey(previous.endedAt, oldZone);
  const newDate = localDayKey(current.endedAt, newZone);
  const oldSeconds = Math.max(0, Math.round(previous.elapsedSeconds));
  if (oldDate !== newDate) {
    await mutateDay(oldDate, oldZone, id, -oldSeconds, "new-sessions");
    await mutateDay(newDate, newZone, id, seconds, "new-sessions");
  } else if (oldSeconds !== seconds) {
    // The ID is already present; apply a correction without exposing the
    // individual duration in the shared summary.
    const ref = refs.activity.child(ME).child("days").child(newDate);
    const result = await ref.transaction((raw) => {
      if (!raw || !raw.applied || !raw.applied[id]) return;
      raw.totalSeconds = Math.max(0, (raw.totalSeconds || 0) + seconds - oldSeconds);
      raw.updatedAt = TIMESTAMP;
      return raw;
    });
    if (!result.committed) throw new Error("Could not correct the daily activity summary.");
  }
}

function renderMonthHeader() {
  const [year, month] = selectedMonth.split("-").map(Number);
  $("calendarMonth").textContent = new Date(Date.UTC(year, month - 1, 1))
    .toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const today = localDayKey(Date.now(), zone);
  const daysMine = monthCoveredDays(mine, selectedMonth);
  const daysTheirs = monthCoveredDays(theirs, selectedMonth);
  $("calendarMineLabel").textContent = DISPLAY_NAME[ME] + " · " + today + " · " + zone;
  if (theirsClock && Number.isFinite(theirsClock.updatedAt)
      && Date.now() - theirsClock.updatedAt < 24 * 60 * 60 * 1000) {
    $("calendarTheirsLabel").textContent = DISPLAY_NAME[THEM] + " · " + theirsClock.date + " · " + theirsClock.timeZone;
  } else {
    $("calendarTheirsLabel").textContent = DISPLAY_NAME[THEM] + " · local day not reported";
  }
  $("calendarMineTotal").textContent = daysMine
    ? formatTotal(monthTotal(mine, selectedMonth)) + " · " + daysMine + (daysMine === 1 ? " shared day" : " shared days")
    : "No shared data";
  $("calendarTheirsTotal").textContent = daysTheirs
    ? formatTotal(monthTotal(theirs, selectedMonth)) + " · " + daysTheirs + (daysTheirs === 1 ? " shared day" : " shared days")
    : "No shared data";
}

function renderCalendar() {
  const grid = $("calendarGrid");
  grid.replaceChildren();
  for (const name of DAY_NAMES) {
    const label = document.createElement("div");
    label.className = "calendar-weekday";
    label.textContent = name.slice(0, 3);
    label.setAttribute("aria-label", name);
    grid.append(label);
  }
  const today = localDayKey(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  for (const date of monthCells(selectedMonth)) {
    const cell = document.createElement("div");
    cell.className = "calendar-day" + (!date ? " calendar-day-empty" : "");
    if (!date) { grid.append(cell); continue; }
    cell.dataset.date = date;
    const day = Number(date.slice(-2));
    const heading = document.createElement("span");
    heading.className = "calendar-date";
    heading.textContent = String(day);
    if (date === today) heading.classList.add("calendar-today");
    cell.append(heading);
    const mineSummary = readDailySummary(mine[date]);
    const theirSummary = readDailySummary(theirs[date]);
    for (const [summary, label, cls] of [
      [mineSummary, DISPLAY_NAME[ME], "calendar-mine"],
      [theirSummary, DISPLAY_NAME[THEM], "calendar-theirs"],
    ]) {
      const line = document.createElement("span");
      line.className = "calendar-total " + cls;
      line.textContent = summary ? formatTotal(summary.totalSeconds) : "—";
      line.setAttribute("aria-label", summary
        ? label + ": " + formatTotal(summary.totalSeconds)
        : label + ": no shared data");
      cell.append(line);
    }
    const tip = [];
    if (mineSummary) tip.push(DISPLAY_NAME[ME] + " local day · " + zoneList(mineSummary.timeZones).join(", "));
    if (theirSummary) tip.push(DISPLAY_NAME[THEM] + " local day · " + zoneList(theirSummary.timeZones).join(", "));
    if (tip.length) cell.title = tip.join("; ");
    grid.append(cell);
  }
  renderMonthHeader();
}

function publishLocalClock() {
  if (!connected) return;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  refs.activity.child(ME).child("calendarClock").set({
    date: localDayKey(Date.now(), timeZone), timeZone, updatedAt: TIMESTAMP,
  }).catch((error) => console.error("Calendar timezone update failed:", error));
}

function showBackfill(message) {
  $("backfillStatus").textContent = message;
}

function renderBackfillPreview(zone, entries) {
  if (!entries.length) return showBackfill("There are no past sessions to backfill.");
  const dated = entries.map((s) => ({
    ...s,
    date: localDayKey(s.endedAt, s.timeZone || zone),
  }));
  const dates = dated.map((s) => s.date).sort();
  const from = dates[0];
  const through = localDayKey(Date.now(), zone);
  preview = { zone, entries: dated, from, through };
  $("backfillPreviewText").textContent = `${dated.length} sessions · ${formatTotal(dated.reduce((n, s) => n + s.elapsedSeconds, 0))} · ${from} through ${through}. Existing timezone data is preserved; older entries use ${zone}.`;
  $("backfillPreview").hidden = false;
  showBackfill("Review the dates and timezone before publishing.");
}

async function beginBackfillPreview() {
  if (!connected || !sessions.isInitialLoadComplete()) {
    showBackfill("Connect and wait for the session history to finish loading first.");
    return;
  }
  const zone = $("backfillTimeZone").value;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); }
  catch { showBackfill("Enter a valid IANA timezone, such as Europe/London."); return; }
  try {
    const full = await sessions.refreshCompleteHistory();
    if (backfillMeta && backfillMeta.timeZone !== zone) {
      showBackfill("This history was already attributed to " + backfillMeta.timeZone + ". Keep that timezone for consistency.");
      return;
    }
    renderBackfillPreview(zone, full);
  } catch (error) {
    showBackfill(error.message || "Couldn't load complete history. Try again while online.");
  }
}

async function publishBackfill() {
  if (!preview) return;
  const { zone, entries, from, through } = preview;
  const metadataRef = refs.activity.child(ME).child("backfill");
  try {
    const reservation = await metadataRef.transaction((raw) => {
      if (raw && raw.timeZone !== zone) return;
      return { timeZone: zone, from, through, policyVersion: 1, updatedAt: TIMESTAMP };
    });
    if (!reservation.committed) throw new Error("Backfill timezone is already set differently.");
    const groups = new Map();
    for (const entry of entries) {
      const entryZone = entry.timeZone || zone;
      const date = localDayKey(entry.endedAt, entryZone);
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(entry);
    }
    for (const [date, existing] of groups) {
      const dayRef = refs.activity.child(ME).child("days").child(date);
      const result = await dayRef.transaction((raw) => {
        const day = raw && typeof raw === "object" ? raw : blankSummary(date, zone, "backfilled");
        day.date = date;
        day.totalSeconds = Number.isInteger(day.totalSeconds) ? day.totalSeconds : 0;
        day.sessionCount = Number.isInteger(day.sessionCount) ? day.sessionCount : 0;
        day.applied = day.applied && typeof day.applied === "object" ? day.applied : {};
        day.timeZones = zoneList(day.timeZones);
        for (const entry of existing) {
          if (day.applied[entry.id]) continue;
          day.applied[entry.id] = true;
          day.totalSeconds += Math.max(0, Math.round(entry.elapsedSeconds));
          day.sessionCount += 1;
          const entryZone = entry.timeZone || zone;
          if (!day.timeZones.includes(entryZone)) day.timeZones.push(entryZone);
          day.timeZone = entryZone;
        }
        day.coverage = "backfilled";
        day.updatedAt = TIMESTAMP;
        return day;
      });
      if (!result.committed) throw new Error("Could not publish activity for " + date + ". Try the same backfill again while online.");
    }
    preview = null;
    $("backfillPreview").hidden = true;
    showBackfill("Past activity is shared through " + through + ".");
  } catch (error) {
    showBackfill(error.message || "Couldn't publish past activity. Try again while online.");
  }
}

export function init() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  selectedMonth = monthKey(Date.now(), zone);
  $("backfillTimeZone").value = zone;
  $("calendarPrev").addEventListener("click", () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    selectedMonth = monthKey(Date.UTC(y, m - 2, 1), "UTC");
    renderCalendar();
  });
  $("calendarNext").addEventListener("click", () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    selectedMonth = monthKey(Date.UTC(y, m, 1), "UTC");
    renderCalendar();
  });
  $("backfillPreviewButton").addEventListener("click", beginBackfillPreview);
  $("backfillCancel").addEventListener("click", () => {
    preview = null;
    $("backfillPreview").hidden = true;
    showBackfill("No older activity was published.");
  });
  $("backfillPublish").addEventListener("click", publishBackfill);

  refs.connected.on("value", (snap) => {
    connected = snap.val() === true;
    publishLocalClock();
  });
  refs.activity.child(ME).child("days").on("value", (snap) => {
    mine = snap.val() || {};
    renderCalendar();
  });
  refs.activity.child(THEM).child("days").on("value", (snap) => {
    theirs = snap.val() || {};
    renderCalendar();
  });
  refs.activity.child(THEM).child("calendarClock").on("value", (snap) => {
    theirsClock = snap.val();
    renderMonthHeader();
  });
  refs.activity.child(ME).child("backfill").on("value", (snap) => {
    backfillMeta = snap.val();
    if (backfillMeta) {
      $("backfillTimeZone").value = backfillMeta.timeZone;
      $("backfillTimeZone").disabled = true;
      $("backfillPreviewButton").textContent = "Refresh history preview";
    }
  });
  sessions.onNewSession((id, current, previous) => {
    publishSession(id, current, previous).catch((error) => {
      console.error("Activity summary write failed:", error);
      showBackfill("A new daily summary could not be shared. It will remain unknown until retried.");
    });
  });
  setInterval(publishLocalClock, 15 * 60 * 1000);
  document.addEventListener("visibilitychange", publishLocalClock);
  renderCalendar();
}
