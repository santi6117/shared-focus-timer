// Rename a category or transfer its recorded sessions from the Dashboard.

import * as categories from "./categories.js";
import * as progress from "./progress-store.js";
import * as sessions from "./sessions.js";
import { UNCATEGORIZED_KEY } from "./lib/categories.js";
import { formatDuration } from "./lib/time.js?v=20261117-categories";

const $ = (id) => document.getElementById(id);
let editing = false;
let busy = false;
let draft;
let lastTransfer;

export function isEditing() { return editing; }

function button(label, accessibleName, action) {
  const control = document.createElement("button");
  control.type = "button";
  control.textContent = label;
  control.setAttribute("aria-label", accessibleName);
  control.addEventListener("click", action);
  return control;
}

export function actions(group, label, board, duplicate) {
  if (!editing) return null;
  const controls = document.createElement("div");
  controls.className = "category-row-actions";
  const kind = group.columnId ? "Progress column" : "Standalone category";
  let accessibleLabel = label;
  if (duplicate) {
    const hint = document.createElement("small");
    hint.textContent = kind;
    controls.append(hint);
    accessibleLabel += " (" + kind + ")";
  }
  const column = board?.columns[group.columnId];
  if (group.columnId ? column : group.categoryKey !== UNCATEGORIZED_KEY) {
    controls.append(button("Rename", "Rename " + accessibleLabel, () => open("rename", group, label, column)));
  }
  controls.append(button("Transfer time", "Transfer time from " + accessibleLabel, () => open("transfer", group, label)));
  return controls;
}

function availableCategories() {
  const named = new Map(categories.options().map(({ key, label }) => [key, label]));
  for (const session of sessions.all()) {
    if (!progress.sessionLink(session)?.columnId && session.categoryKey !== UNCATEGORIZED_KEY
        && !named.has(session.categoryKey)) {
      named.set(session.categoryKey, categories.labelFor(session.categoryKey));
    }
  }
  return named;
}

function destinations(source) {
  const options = new Map();
  for (const [categoryKey, label] of availableCategories()) {
    if (source.categoryKey !== categoryKey) options.set("category:" + categoryKey, { categoryKey, label });
  }
  const columns = progress.state().board?.columns || {};
  for (const { id, title } of progress.ordered(columns, (column) => column.status !== "deleted")) {
    if (source.columnId !== id) options.set("column:" + id, { columnId: id, label: title });
  }
  return options;
}

function matchingSessions(source) {
  return sessions.all().flatMap((entry) => {
    const target = progress.sessionLink(entry);
    const matches = source.columnId ? target?.columnId === source.columnId
      : !target?.columnId && entry.categoryKey === source.categoryKey;
    return matches ? [{ ...entry, taskId: target?.taskId }] : [];
  });
}

function summarize(entries) {
  const seconds = entries.reduce((sum, entry) => sum + entry.elapsedSeconds, 0);
  return entries.length + (entries.length === 1 ? " session · " : " sessions · ") + formatDuration(seconds);
}

function renderImpact() {
  const transfer = draft.mode === "transfer";
  const destination = transfer && draft.destinations.get($("categoryEditDestination").value);
  const impact = $("categoryEditImpact");
  impact.hidden = !destination?.categoryKey || !draft.entries.some(({ taskId }) => taskId);
  impact.textContent = impact.hidden ? "" : "Moving to a standalone category clears these sessions’ task assignments. Undo restores them.";
  $("categoryEditSave").disabled = busy || (transfer ? !destination : !$("categoryEditName").value.trim());
}

function feedback(message) {
  $("categoryEditStatus").textContent = message;
  $("categoryUndoTransfer").hidden = !lastTransfer;
}

function error(message) {
  $("categoryEditError").textContent = message;
  $("categoryEditError").hidden = !message;
}

function open(mode, source, label, column) {
  if (busy) return;
  const transfer = mode === "transfer";
  if (transfer && !progress.state().ready) {
    feedback("Open this on a device with access to your Progress history to transfer time.");
    return;
  }
  draft = { mode, source, label, column };
  $("categoryEditTitle").textContent = (transfer ? "Transfer time from " : "Rename ") + label;
  $("categoryEditNameField").hidden = transfer;
  $("categoryEditDestinationField").hidden = !transfer;
  error("");
  if (transfer) {
    draft.entries = matchingSessions(source);
    draft.destinations = destinations(source);
    $("categoryEditSummary").textContent = summarize(draft.entries) + " across all time.";
    const select = $("categoryEditDestination");
    const placeholder = new Option(draft.destinations.size ? "Choose a category" : "No other categories", "");
    placeholder.disabled = true;
    select.replaceChildren(placeholder);
    for (const [key, item] of draft.destinations) {
      select.add(new Option(item.label + (item.columnId ? " · Progress column" : " · Standalone category"), key));
    }
    select.value = "";
    $("categoryEditSave").textContent = "Transfer time";
  } else {
    $("categoryEditSummary").textContent = "This updates the name wherever the category appears.";
    const input = $("categoryEditName");
    input.maxLength = column ? 140 : Math.max(40, label.length);
    input.value = label;
    $("categoryEditSave").textContent = "Save name";
  }
  renderImpact();
  $("categoryEditor").showModal();
  const field = transfer ? $("categoryEditDestination") : $("categoryEditName");
  field.focus();
  if (!transfer) field.select();
}

async function saveRename() {
  const name = $("categoryEditName").value.trim();
  const { source, label, column } = draft;
  if (name === label) return;
  if (column) {
    await progress.change((board) => {
      const current = progress.requireItem(board.columns, source.columnId, column.revision || 0);
      current.title = name;
      current.revision = (current.revision || 0) + 1;
    });
  } else {
    await categories.rename(source.categoryKey, label, name, [...availableCategories().keys()]);
  }
  feedback("Renamed " + label + " to " + name + ".");
}

async function saveTransfer() {
  const { entries, source, label } = draft;
  const destination = destinations(source).get($("categoryEditDestination").value);
  if (!destination) throw new Error("The destination changed. Close and reopen this transfer.");
  const current = new Map(matchingSessions(source).map((entry) => [entry.id, entry]));
  if (current.size !== entries.length || entries.some((entry) => {
    const latest = current.get(entry.id);
    return !latest || latest.editVersion !== entry.editVersion || latest.taskId !== entry.taskId;
  })) throw new Error("The source history changed. Close and reopen this transfer.");
  const changes = entries.map(({ id, editVersion, taskId }) => ({
    id, editVersion, categoryKey: destination.categoryKey || UNCATEGORIZED_KEY,
    target: destination.columnId ? { columnId: destination.columnId, taskId }
      : source.columnId ? null : undefined,
  }));
  await sessions.changeSessionCategories(changes);
  lastTransfer = changes.map(({ id, editVersion }) => ({ id, editVersion: editVersion + 1 }));
  feedback("Moved " + summarize(entries) + " from " + label + " to " + destination.label + ".");
}

function close() {
  $("categoryEditor").close();
  // The source row can disappear after the transfer. Return to the mode switch.
  if (!document.activeElement.closest("#breakdownRows")) $("breakdownEdit").focus();
}

export function init(render) {
  $("breakdownEdit").addEventListener("click", (event) => {
    editing = !editing;
    event.currentTarget.setAttribute("aria-pressed", editing);
    event.currentTarget.textContent = editing ? "Done" : "Edit";
    event.currentTarget.setAttribute("aria-label", editing ? "Done editing categories" : "Edit categories");
    render();
  });
  $("categoryEditDestination").addEventListener("change", renderImpact);
  $("categoryEditName").addEventListener("input", renderImpact);
  $("categoryEditCancel").addEventListener("click", close);
  $("categoryEditor").addEventListener("cancel", (event) => {
    event.preventDefault();
    if (!busy) close();
  });
  $("categoryEditForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || $("categoryEditSave").disabled) return;
    busy = true;
    error("");
    for (const element of event.currentTarget.elements) element.disabled = true;
    try {
      if (!progress.state().connected) throw new Error("Connect to save category changes.");
      if (draft.mode === "rename") await saveRename();
      else await saveTransfer();
      close();
    } catch (failure) {
      error(failure.message || "The category change could not be saved.");
    } finally {
      busy = false;
      for (const element of $("categoryEditForm").elements) element.disabled = false;
      renderImpact();
    }
  });
  $("categoryUndoTransfer").addEventListener("click", async (event) => {
    if (!lastTransfer || busy) return;
    const control = event.currentTarget;
    busy = true;
    control.disabled = true;
    try {
      await sessions.changeSessionCategories(lastTransfer, { undo: true });
      lastTransfer = null;
      feedback("Transfer undone.");
      $("breakdownEdit").focus();
    } catch (failure) {
      feedback(failure.message || "The transfer could not be undone.");
    } finally {
      control.disabled = false;
      busy = false;
    }
  });
}
