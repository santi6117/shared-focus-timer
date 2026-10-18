// Owner-written daily summaries for the shared calendar. The partner reads
// these summaries only; session records and category labels remain private.

import { refs, TIMESTAMP, serverNow } from "./firebase.js";
import { ME, THEM } from "./identity.js";
import { DISPLAY_NAME } from "./config.js";
import * as sessions from "./sessions.js";
import { formatTotal } from "./lib/time.js";
import { localDayKey, monthCells, monthCoveredDays, monthKey, monthTotal, readDailySummary, reconcileDays } from "./lib/activity-calendar.js";

const $ = (id) => document.getElementById(id);
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
let mine = {}, theirs = {};
let selectedMonth = "";
let preview = null;
let backfillMeta = null;
let theirsClock = null;
let connected = false;

// Only a usable saved zone reserves historical attribution. Malformed metadata
// must remain recoverable through preview instead of locking an empty field.
function validTimeZone(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch { return false; }
}

function zoneList(value) {
  if (Array.isArray(value)) return value.filter((zone) => typeof zone === "string");
  if (value && typeof value === "object") return Object.values(value).filter((zone) => typeof zone === "string");
  return [];
}
// Recompute absolute totals inside one owner transaction, rather than applying
// deltas in separate day writes. Retrying or moving across midnight is atomic.
// IDs already shared retain consent; older unpublished records require preview.
async function reconcile(approved = null) {
  const entries = await Promise.all(sessions.history().map(async (entry) => {
    // Firebase push IDs encode creation time; publish only a one-way digest.
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(entry.id));
    const id = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
    return { ...entry, id, approved: approved?.ids.includes(entry.id) };
  }));
  let failure = null;
  const result = await refs.activity.child(ME).transaction((raw) => {
    try {
    const owner = raw || {};
    const savedZone = validTimeZone(owner.backfill?.timeZone) ? owner.backfill.timeZone : null;
    if (approved && savedZone && savedZone !== approved.zone) {
      throw new Error("Backfill timezone is already set differently.");
    }
    const zone = approved?.zone || savedZone;
    const days = reconcileDays(owner.days || {}, entries, zone, entries.filter((entry) => entry.approved).map((entry) => entry.id), TIMESTAMP);
    if (approved) owner.backfill = {
      timeZone: approved.zone, from: approved.from, through: approved.through,
      policyVersion: 1, updatedAt: TIMESTAMP,
    };
    owner.days = days;
    return owner;
    } catch (error) { failure = error; return; }
  });
  if (!result.committed) throw failure || new Error("Could not save daily activity. Please retry while online.");
}

let syncing = false, dirty = false;
// Failed publication survives reconnects and reloads because eligibility is
// stored with the private session, not in an in-memory notification queue.
async function syncSummaries() {
  dirty = true;
  if (syncing || !connected || !sessions.isInitialLoadComplete()) return;
  syncing = true;
  try {
    while (dirty && connected) {
      dirty = false;
      await reconcile();
    }
  } catch (error) {
    dirty = true;
    console.error("Activity summary write failed:", error);
    showBackfill("Daily activity could not be shared. Retrying when connected; private sessions are saved.");
  } finally { syncing = false; }
}

function renderMonthHeader() {
  const [year, month] = selectedMonth.split("-").map(Number);
  $("calendarMonth").textContent = new Date(Date.UTC(year, month - 1, 1))
    .toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const today = localDayKey(serverNow(), zone);
  const daysMine = monthCoveredDays(mine, selectedMonth);
  const daysTheirs = monthCoveredDays(theirs, selectedMonth);
  $("calendarMineLabel").textContent = DISPLAY_NAME[ME] + " · " + today + " · " + zone;
  if (theirsClock && Number.isFinite(theirsClock.updatedAt)
      && serverNow() - theirsClock.updatedAt < 24 * 60 * 60 * 1000) {
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
  const today = localDayKey(serverNow(), Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
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
    date: localDayKey(serverNow(), timeZone), timeZone, updatedAt: TIMESTAMP,
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
  const through = dates[dates.length - 1];
  preview = { zone, entries: dated, from, through, signature: JSON.stringify(entries) };
  $("backfillPreviewText").textContent = `${dated.length} sessions · ${formatTotal(dated.reduce((n, s) => n + s.elapsedSeconds, 0))} · ${from} through ${through}. Existing timezone data is preserved; older entries use ${zone}.`;
  $("backfillPreview").hidden = false;
  showBackfill("Review the dates and timezone before publishing.");
}

async function beginBackfillPreview() {
  if (!connected || !sessions.isInitialLoadComplete()) {
    showBackfill("Connect and wait for the session history to finish loading first.");
    return;
  }
  const zone = $("backfillTimeZone").value.trim();
  if (!validTimeZone(zone)) {
    showBackfill("Enter a valid timezone, such as America/Puerto_Rico or Europe/London.");
    return;
  }
  $("backfillTimeZone").value = zone;
  try {
    const full = await sessions.refreshCompleteHistory();
    if (validTimeZone(backfillMeta?.timeZone) && backfillMeta.timeZone !== zone) {
      showBackfill("This history was already attributed to " + backfillMeta.timeZone + ". Keep that timezone for consistency.");
      return;
    }
    renderBackfillPreview(zone, full);
  } catch (error) {
    showBackfill(error.message || "Couldn't load complete history. Try again while online.");
  }
}

let publishingBackfill = false;
async function publishBackfill() {
  if (!preview || publishingBackfill) return;
  if (!connected) return showBackfill("Connect before publishing past activity.");
  publishingBackfill = true;
  $("backfillPublish").disabled = true;
  try {
    // Refresh before publication; the consent is to the exact reviewed records.
    // New or corrected history requires another preview instead of silent sharing.
    const fresh = await sessions.refreshCompleteHistory();
    if (JSON.stringify(fresh) !== preview.signature) {
      preview = null;
      $("backfillPreview").hidden = true;
      throw new Error("History changed. Preview it again before publishing.");
    }
    const { zone, entries, from, through } = preview;
    await reconcile({ zone, ids: entries.map((entry) => entry.id), from, through });
    preview = null;
    $("backfillPreview").hidden = true;
    showBackfill("Past activity is shared through " + through + ".");
  } catch (error) {
    showBackfill(error.message || "Couldn't publish past activity. Try again while online.");
  } finally {
    publishingBackfill = false;
    $("backfillPublish").disabled = false;
  }
}

export function init() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  selectedMonth = monthKey(serverNow(), zone);
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
    syncSummaries();
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
    const input = $("backfillTimeZone");
    const reserved = validTimeZone(backfillMeta?.timeZone);
    if (reserved) {
      input.value = backfillMeta.timeZone;
    } else if (input.disabled || !input.value.trim()) {
      input.value = zone;
    }
    input.disabled = reserved;
    $("backfillPreviewButton").textContent = backfillMeta ? "Refresh history preview" : "Preview older activity";
  });
  sessions.onChange(syncSummaries);
  setInterval(() => { publishLocalClock(); if (dirty) syncSummaries(); renderCalendar(); }, 30_000);
  document.addEventListener("visibilitychange", () => {
    publishLocalClock();
    syncSummaries();
    renderCalendar();
  });
  renderCalendar();
}
