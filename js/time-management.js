// Dashboard time editing: review one private session at a time, preserve drafts
// across navigation, and send version-checked snapshots through sessions.js.

import * as sessions from "./sessions.js";
import * as categories from "./categories.js";
import { serverNow } from "./firebase.js";
import { formatTotal } from "./lib/time.js";
import { dateTimeInZone, validateWork } from "./lib/session-edits.js";
import { showSession } from "./progress.js?v=20261117-categories";
import * as progressStore from "./progress-store.js";
import { openForTime, targetLabel, columnLabel } from "./focus-picker.js?v=20261117-categories";
import { UNCATEGORIZED_KEY } from "./lib/categories.js";

const $ = (id) => document.getElementById(id);
const PAGE_SIZE = 5;
let page = 0, editing = null, draftId = null, removal = null, busy = false;
let draftFocus, originalTarget, historyFilter;
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const status = (text) => { $("timeStatus").textContent = text; };

function sessionTarget(entry) {
  const link = entry && progressStore.sessionLink(entry);
  return link?.columnId ? { columnId: link.columnId, taskId: link.taskId } : null;
}

function renderDraftFocus() {
  if (!draftFocus) return;
  const { target, categoryLabel } = draftFocus;
  $("timeFocusChoice").textContent = assignmentLabel(target) || categoryLabel || "Unassigned";
}

function assignmentLabel(target) {
  return target?.taskId ? targetLabel(target) + " · " + columnLabel(target) : targetLabel(target);
}

function pickDraftFocus() {
  openForTime({
    ...draftFocus, title: "Assign time to",
    choose(choice) {
      draftFocus.target = choice.target || null;
      draftFocus.categoryKey = choice.key || UNCATEGORIZED_KEY;
      draftFocus.categoryLabel = choice.target ? "" : choice.label;
      draftFocus.categorySelected = !choice.target;
      renderDraftFocus();
    },
  });
}

function pickHistoryFilter() {
  openForTime({
    title: "Filter logged time", filter: true, target: historyFilter?.target,
    categoryLabel: historyFilter?.key ? historyFilter.label : "",
    choose(choice) {
      historyFilter = choice.label ? choice : null;
      page = 0;
      renderHistory();
    },
  });
}

function closeForm() {
  $("timeForm").hidden = true;
  editing = null;
  draftId = null;
  draftFocus = null;
}

function openForm(entry = null) {
  if (busy) return;
  removal = null;
  $("timeRemoveReview").hidden = true;
  editing = entry ? { ...entry } : null;
  draftId = entry ? null : sessions.newManualId();
  let zone = entry?.timeZone || browserZone();
  try { dateTimeInZone(entry?.endedAt ?? serverNow(), zone); }
  catch { zone = browserZone(); }
  $("timeFormHeading").textContent = entry ? "Edit logged work" : "Add missed work";
  $("timeEnd").value = dateTimeInZone(entry?.endedAt ?? serverNow() - 60_000, zone);
  $("timeZone").value = zone;
  $("timeMinutes").value = entry ? entry.elapsedSeconds / 60 : "";
  originalTarget = sessionTarget(entry);
  const categoryKey = entry?.categoryKey || (!entry && historyFilter?.key) || UNCATEGORIZED_KEY;
  draftFocus = {
    target: entry ? originalTarget : historyFilter?.target || null, categoryKey,
    categoryLabel: categoryKey === UNCATEGORIZED_KEY ? "" : categories.labelFor(categoryKey),
  };
  renderDraftFocus();
  $("timeSave").textContent = entry ? "Save correction" : "Add work";
  $("timeForm").hidden = false;
  status("");
  $(entry ? "timeMinutes" : "timeEnd").focus();
}

// The list can refresh while an edit form stays open. Keep that form's version
// fixed so the save reports a conflict rather than overwriting a remote edit.
function renderHistory() {
  const filterTarget = historyFilter?.target;
  $("timeFocusFilter").textContent = historyFilter
    ? "Filter · " + (targetLabel(filterTarget) || historyFilter.label)
    : "Filter by task or category";
  const entries = sessions.history().filter((entry) => {
    if (!historyFilter) return true;
    const target = sessionTarget(entry);
    if (!filterTarget) return !target && entry.categoryKey === historyFilter.key;
    return filterTarget.taskId ? target?.taskId === filterTarget.taskId : target?.columnId === filterTarget.columnId;
  }).sort((a, b) => b.endedAt - a.endedAt || a.id.localeCompare(b.id));
  page = Math.min(page, Math.max(0, Math.ceil(entries.length / PAGE_SIZE) - 1));
  const list = $("timeHistory");
  list.replaceChildren();
  $("timeHistoryCount").textContent = sessions.isInitialLoadComplete()
    ? (entries.length ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, entries.length)} of ${entries.length} records`
      : historyFilter ? "No sessions match this filter." : "No logged work yet.")
    : "Loading your history…";
  $("timeNewer").disabled = busy || page === 0;
  $("timeOlder").disabled = busy || (page + 1) * PAGE_SIZE >= entries.length;
  for (const entry of entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
    const row = document.createElement("li");
    row.dataset.sessionId = entry.id;
    row.className = "time-history-row" + (entry.removed ? " time-record-removed" : "");
    const title = document.createElement("strong");
    const target = sessionTarget(entry);
    title.textContent = (entry.elapsedSeconds < 60 ? entry.elapsedSeconds + "s" : formatTotal(entry.elapsedSeconds))
      + " · " + (assignmentLabel(target) || categories.labelFor(entry.categoryKey))
      + (entry.removed ? " · Removed" : "");
    const date = document.createElement("span");
    const zone = entry.timeZone || browserZone();
    try { date.textContent = new Date(entry.endedAt).toLocaleString(undefined, { timeZone: zone }) + " · " + zone; }
    catch { date.textContent = "Unknown timezone · edit to correct"; }
    const actions = document.createElement("div");
    actions.className = "time-record-actions";
    const action = (label, handler) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.disabled = busy;
      button.addEventListener("click", handler);
      actions.append(button);
    };
    if (!entry.removed) {
      action("Edit", () => openForm(entry));
      if ((entry.source === "timer" || target) && progressStore.state().ready) {
        action("Session note", () => showSession(entry));
      }
      action("Remove", () => {
        closeForm();
        removal = { ...entry };
        $("timeRemoveText").textContent = `Remove ${title.textContent} ending ${date.textContent} from your totals? You can undo this.`;
        $("timeRemoveReview").hidden = false;
        $("timeRemoveConfirm").focus();
      });
    } else action("Restore", () => saveChange(entry, { ...workFields(entry), removed: false }, "Work restored."));
    if (entry.canUndo) action("Undo", () => saveChange(entry, "undo", "Last change undone."));
    row.append(title, date, actions);
    list.append(row);
  }
}

// Pass only the editable snapshot fields; internal versions and source flags
// stay private metadata rather than becoming part of each correction.
function workFields(entry) {
  return {
    endedAt: entry.endedAt, elapsedSeconds: entry.elapsedSeconds,
    categoryKey: entry.categoryKey, timeZone: entry.timeZone, removed: entry.removed,
  };
}

function setBusy(value) {
  busy = value;
  $("timeAdd").disabled = value;
  $("timeFocusFilter").disabled = value;
  for (const input of $("timeForm").elements) input.disabled = value;
  $("timeRemoveConfirm").disabled = value;
  $("timeRemoveCancel").disabled = value;
  renderHistory();
}

async function saveChange(entry, change, message, { target, category } = {}) {
  if (busy) return;
  setBusy(true);
  try {
    if (category) await saveNewCategory();
    await sessions.changeSession(entry.id, entry.editVersion, change, target);
    closeForm();
    removal = null;
    $("timeRemoveReview").hidden = true;
    status(message);
  } catch (error) { status(error.message || "Couldn't save the change. Please try again."); }
  finally { setBusy(false); }
}

async function saveNewCategory() {
  const { categoryKey, categoryLabel, categorySelected } = draftFocus;
  if (categorySelected && categoryLabel && !categories.options().some(({ key }) => key === categoryKey)) {
    await categories.recordUse(categoryKey, categoryLabel);
  }
}

async function submit(event) {
  event.preventDefault();
  if (busy) return;
  let work;
  try {
    work = validateWork({
      dateTime: $("timeEnd").value, timeZone: $("timeZone").value.trim(),
      minutes: $("timeMinutes").value, categoryKey: draftFocus.categoryKey,
    }, serverNow());
  } catch (error) { status(error.message); return; }
  const target = draftFocus.target;
  const changedTarget = target?.columnId !== originalTarget?.columnId || target?.taskId !== originalTarget?.taskId;
  if (editing) return saveChange(editing, work, "Correction saved.", {
    target: changedTarget ? target : undefined, category: true,
  });
  setBusy(true);
  try {
    await saveNewCategory();
    await sessions.addManual(draftId, work, target);
    closeForm();
    page = 0;
    status("Missed work added. Undo is available beside the record.");
  } catch (error) { status(error.message || "Couldn't add your work. Please try again."); }
  finally { setBusy(false); }
}

export function init() {
  $("timeAdd").addEventListener("click", () => openForm());
  $("timeForm").addEventListener("submit", submit);
  $("timeFocusChoice").addEventListener("click", pickDraftFocus);
  $("timeFocusFilter").addEventListener("click", pickHistoryFilter);
  $("timeCancel").addEventListener("click", () => { closeForm(); status("No changes saved."); });
  $("timeRemoveConfirm").addEventListener("click", () => {
    if (removal) saveChange(removal, { ...workFields(removal), removed: true }, "Work removed. You can restore it or undo the change.");
  });
  $("timeRemoveCancel").addEventListener("click", () => {
    removal = null;
    $("timeRemoveReview").hidden = true;
    status("No changes saved.");
  });
  $("timeNewer").addEventListener("click", () => { page--; renderHistory(); });
  $("timeOlder").addEventListener("click", () => { page++; renderHistory(); });
  sessions.onChange(renderHistory);
  progressStore.onChange(renderHistory);
  categories.onChange(renderHistory);
  renderHistory();
}
