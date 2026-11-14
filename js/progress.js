// Render the private Progress board and handle its task and column controls.
import { REMOTE } from "./device.js";
import { serverNow } from "./firebase.js";
import * as timer from "./timer.js";
import * as sessions from "./sessions.js";
import { formatTotal } from "./lib/time.js";
import * as store from "./progress-store.js";

const $ = (id) => document.getElementById(id);
const colors = {
  default: "Default", clay: "Clay", rose: "Rose", amber: "Amber", sage: "Sage",
  forest: "Forest", teal: "Teal", blue: "Blue", indigo: "Indigo", plum: "Plum", slate: "Slate",
};
const completedOpen = new Set();
const taskDrafts = new Map();
let dragTask;
let uid;
let stats;
let refreshDetails;

function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  element.append(...children.filter((child) => child != null));
  return element;
}

function button(text, click, attrs = {}) {
  const control = el("button", { type: "button", ...attrs }, text);
  control.addEventListener("click", click);
  return control;
}

function field(label, control) {
  control.setAttribute("aria-label", label);
  return el("label", {}, el("span", {}, label), control);
}

function option(value, label) { return el("option", { value }, label); }
function colorPicker(selected = "default") {
  const choices = Object.entries(colors).map(([value, label]) => {
    const radio = el("input", { type: "radio", name: "color", value });
    radio.defaultChecked = value === selected;
    return el("label", { "data-color": value }, radio,
      el("span", { class: "progress-color-dot", "aria-hidden": "true" }), label);
  });
  return el("fieldset", { class: "progress-colors" }, el("legend", {}, "Accent color"), ...choices);
}
function blankStats() { return { total: 0, week: 0, sessions: [] }; }
function duration(seconds) {
  const leftover = seconds % 60;
  if (seconds < 60) return seconds ? seconds + "s" : "0m";
  return leftover ? formatTotal(seconds - leftover) + " " + leftover + "s"
    : formatTotal(seconds);
}
function date(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
function dueDate(day) {
  return new Date(day + "T12:00:00").toLocaleDateString(undefined, { dateStyle: "medium" });
}

function showError(error, dialog = false) {
  const message = $(dialog ? "progressDialogError" : "progressError");
  if (!message) return;
  message.textContent = error?.code === "PERMISSION_DENIED"
    ? "This device no longer has access to Progress." : error?.message || "";
  message.hidden = !error;
}

async function act(control, work, dialog = false) {
  showError(null, dialog);
  control.disabled = true;
  try { await work(); }
  catch (error) { showError(error, dialog); }
  finally { control.disabled = false; }
}

function titleFrom(form) {
  const title = form.elements.title.value.trim();
  if (!title) throw new Error("Enter a title.");
  return title;
}

function selectTarget(target, goToTimer = false) {
  if (timer.focusTargetLocked()) {
    if (targetValue(timer.state().focusTarget) !== targetValue(target)) return false;
  } else {
    timer.setFocusTarget(target);
  }
  if (goToTimer) {
    closeDialog();
    $("timerView").classList.remove("is-compact");
    const compact = $("compactTimerToggle");
    compact.setAttribute("aria-pressed", "false");
    compact.title = "Minimize timer";
    window.location.hash = "timer";
  }
  return true;
}

function targetValue(target) {
  return target?.taskId ? "task:" + target.taskId : target?.columnId ? "column:" + target.columnId : "";
}

function reconcileTarget(data) {
  if (REMOTE || !data || timer.focusTargetLocked()) return;
  const target = timer.state().focusTarget;
  if (!target) return;
  const task = data.tasks[target.taskId];
  const column = data.columns[task?.columnId || target.columnId];
  if (!store.activeColumn(column) || (target.taskId && !store.activeTask(task))) {
    timer.setFocusTarget(null);
  } else if (task && task.columnId !== target.columnId) {
    timer.setFocusTarget({ taskId: target.taskId, columnId: task.columnId });
  }
}

function render() {
  const { board, links, ready, denied, connected } = store.state();
  const status = $("progressStatus");
  if (!ready) {
    status.hidden = false;
    status.textContent = denied ? "This browser needs access to your personal board. Device UID: " + uid
      : connected ? "Connecting to your board…" : "Waiting for a connection to Progress…";
    $("progressContent").hidden = true;
    closeDialog();
    return;
  }
  if (REMOTE && !$("progressView").hidden) sessions.watchHistory();
  stats = store.summarize(sessions.all(), links, serverNow());
  status.hidden = connected && sessions.isInitialLoadComplete();
  status.textContent = connected ? "Loading focus history…" : "Offline. Reconnect to edit your board.";
  $("progressContent").hidden = false;
  reconcileTarget(board);
  if (!$("progressView").hidden) renderBoard(board);
  if ($("progressDialog").open) refreshDetails?.();
}

function renderBoard(data) {
  const container = $("progressColumns");
  const columns = store.ordered(data.columns, store.activeColumn);
  const focusedId = container.contains(document.activeElement) ? document.activeElement.id : "";
  container.replaceChildren(...columns.map((column) => columnView(data, column)));
  $("progressEmpty").hidden = columns.length > 0;
  if (focusedId) ($(focusedId) || $("progressTrack")).focus({ preventScroll: true });
}

function columnView(data, column) {
  const active = store.tasksIn(data, column.id);
  const completed = store.tasksIn(data, column.id, (task) => task.completedAt && !task.deletedAt)
    .sort((a, b) => b.completedAt - a.completedAt);
  const summary = stats.columns.get(column.id) || blankStats();
  const titleId = "column-" + column.id;
  const heading = el("div", { class: "progress-column-heading" },
    el("h2", { id: titleId }, column.title),
    button("⋯", () => showColumn(column.id), {
      id: "edit-" + titleId, class: "progress-quiet", "aria-label": "Column options for " + column.title,
    }));
  const total = sessions.isInitialLoadComplete()
    ? "Total " + duration(summary.total) + " · This week " + duration(summary.week)
    : "Loading focus time…";
  const activeList = el("ul", { class: "progress-task-list", "aria-label": "Active tasks" },
    ...active.map((task) => taskRow(task)));
  const details = el("details", { class: "progress-completed" },
    el("summary", { id: "completed-" + column.id }, "Completed (" + completed.length + ")"),
    completed.length
      ? el("ul", { class: "progress-task-list" }, ...completed.map((task) => taskRow(task)))
      : el("p", { class: "progress-muted" }, "No completed tasks yet."));
  details.open = completedOpen.has(column.id);
  details.addEventListener("toggle", () => {
    if (!details.isConnected) return;
    if (details.open) completedOpen.add(column.id);
    else completedOpen.delete(column.id);
  });
  const section = el("section", {
    class: "progress-column", "aria-labelledby": titleId, "data-color": column.color || "default",
  }, heading, column.description ? el("p", { class: "progress-description" }, column.description) : null,
  el("p", { class: "progress-column-total" }, total), activeList, addTaskControl(column), details);
  section.addEventListener("dragover", (event) => {
    if (!dragTask || event.defaultPrevented) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });
  section.addEventListener("drop", (event) => {
    if (!dragTask || event.defaultPrevented) return;
    event.preventDefault();
    dropTask(column.id);
  });
  return section;
}

function addTaskControl(column) {
  const id = column.id;
  if (!taskDrafts.has(id)) {
    return button("+ Add task", () => {
      taskDrafts.set(id, "");
      renderBoard(store.state().board);
      $("task-input-" + id).focus();
    }, { id: "add-task-" + id, class: "progress-add-task", "aria-label": "Add task to " + column.title });
  }
  const input = el("input", {
    name: "title", id: "task-input-" + id, "aria-label": "Task title in " + column.title,
    required: "", maxlength: "140", placeholder: "Task name", autocomplete: "off",
  });
  input.value = taskDrafts.get(id);
  input.addEventListener("input", () => taskDrafts.set(id, input.value));
  const cancel = () => {
    taskDrafts.delete(id);
    renderBoard(store.state().board);
    $("add-task-" + id).focus();
  };
  input.addEventListener("keydown", (event) => { if (event.key === "Escape") cancel(); });
  const submit = el("button", { type: "submit", class: "progress-primary" }, "Add");
  const form = el("form", { class: "progress-inline" }, input, submit, button("Cancel", cancel));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    act(submit, async () => {
      const title = titleFrom(form);
      const taskId = crypto.randomUUID();
      await store.change((data) => {
        if (!store.activeColumn(data.columns[id])) throw new Error("This column is unavailable.");
        data.tasks[taskId] = { title, columnId: id, position: store.nextPosition(store.tasksIn(data, id)) };
      });
      taskDrafts.set(id, "");
      renderBoard(store.state().board);
      $("task-input-" + id)?.focus();
    });
  });
  return form;
}

function taskRow(task) {
  const summary = stats.tasks.get(task.id);
  const title = button(task.title, () => showTask(task.id), {
    id: "open-task-" + task.id, class: "progress-task-title",
  });
  const check = button(task.completedAt ? "✓" : "", (event) => {
    act(event.currentTarget, () => setCompleted(task.id, !task.completedAt));
  }, {
    id: "check-task-" + task.id, class: "progress-check",
    "aria-label": (task.completedAt ? "Restore " : "Complete ") + task.title,
  });
  const focus = !REMOTE && !task.completedAt ? button("Focus", (event) => {
    if (!selectTarget({ taskId: task.id, columnId: task.columnId }, true)) {
      showError(new Error("Reset the timer to end the current session before changing targets."));
      event.currentTarget.focus();
    }
  }, { class: "progress-task-focus", "aria-label": "Focus on " + task.title }) : null;
  const highlighted = task.highlighted === true;
  const highlight = button(highlighted ? "★" : "☆", (event) => {
    act(event.currentTarget, () => store.change((data) => {
      const current = store.requireItem(data.tasks, task.id);
      if (current.deletedAt) throw new Error("Restore this task from Trash first.");
      // This display flag shares the board's sync without changing the task revision.
      if (highlighted) delete current.highlighted;
      else current.highlighted = true;
    }));
  }, {
    id: "highlight-task-" + task.id, class: "progress-task-highlight",
    "aria-label": "Highlight " + task.title, "aria-pressed": String(highlighted),
    title: highlighted ? "Remove highlight" : "Highlight task",
  });
  const row = el("li", {
    class: "progress-task",
    "data-completed": String(Boolean(task.completedAt)),
    "data-highlighted": String(highlighted),
  },
    check,
    el("div", { class: "progress-task-main" }, title, task.dueDate || summary?.total
      ? el("div", { class: "progress-task-meta" }, [
        task.dueDate ? "Due " + dueDate(task.dueDate) : "",
        summary?.total ? duration(summary.total) : "",
      ].filter(Boolean).join(" · ")) : null),
    focus, highlight);
  if (!task.completedAt) {
    row.draggable = true;
    row.addEventListener("dragstart", (event) => {
      dragTask = task.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-progress-task", task.id);
      row.classList.add("progress-dragging");
    });
    row.addEventListener("dragend", clearDrag);
    row.addEventListener("dragover", (event) => {
      if (!dragTask || dragTask === task.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      row.classList.add("progress-drop-before");
    });
    row.addEventListener("dragleave", (event) => {
      if (!row.contains(event.relatedTarget)) row.classList.remove("progress-drop-before");
    });
    row.addEventListener("drop", (event) => {
      if (!dragTask) return;
      event.preventDefault();
      if (dragTask === task.id) clearDrag();
      else dropTask(task.columnId, task.id);
    });
  }
  return row;
}

function clearDrag() {
  dragTask = null;
  document.querySelectorAll(".progress-dragging, .progress-drop-before").forEach((row) => {
    row.classList.remove("progress-dragging", "progress-drop-before");
  });
}

async function dropTask(columnId, beforeId) {
  const id = dragTask;
  clearDrag();
  showError(null);
  try { await store.change((data) => store.moveTask(data, id, columnId, beforeId)); }
  catch (error) { showError(error); }
}

function setCompleted(id, complete) {
  const now = serverNow();
  return store.change((data) => {
    const task = store.requireItem(data.tasks, id);
    if (task.deletedAt) throw new Error("Restore this task from Trash first.");
    task.completedAt = complete ? (task.completedAt || now) : null;
  });
}

function textInput(value, attrs = {}) {
  const input = el("input", attrs);
  input.value = value || "";
  return input;
}

function area(value, name, maxlength = 3000) {
  const control = el("textarea", { name, maxlength, rows: "3" });
  control.value = value || "";
  return control;
}

function openDialog(title, ...content) {
  refreshDetails = null;
  const dialog = $("progressDialog");
  dialog.replaceChildren(
    el("header", { class: "progress-dialog-header" },
      el("h2", { id: "progressDialogTitle", tabindex: "-1" }, title),
      button("×", closeDialog, { "aria-label": "Close details", class: "progress-quiet" })),
    el("p", { id: "progressDialogError", class: "progress-error", role: "status", hidden: "" }),
    ...content.filter((child) => child != null),
  );
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  $("progressDialogTitle").focus();
}

function closeDialog() {
  refreshDetails = null;
  const dialog = $("progressDialog");
  if (dialog.open) dialog.close();
  dialog.replaceChildren();
}

function editForm(fields, saveLabel, onSave) {
  const submit = el("button", { type: "submit", class: "progress-primary" }, saveLabel);
  const form = el("form", { class: "progress-edit" }, ...fields, el("div", {}, submit));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    act(submit, () => onSave(form), true);
  });
  return form;
}

function dialogAction(label, work, attrs = {}) {
  return button(label, (event) => act(event.currentTarget, work, true), attrs);
}

function openItemDialog(title, actions, editor, extras, getSummary, historyTitle, back) {
  const detail = el("p", { class: "progress-muted" });
  const historySlot = el("div");
  let previousHistory;
  openDialog(title, detail, actions, editor, extras, historySlot);
  refreshDetails = () => {
    const { text, entries } = getSummary();
    detail.textContent = text;
    const currentHistory = JSON.stringify(entries);
    if (currentHistory === previousHistory) return;
    previousHistory = currentHistory;
    const focused = historySlot.contains(document.activeElement) ? document.activeElement.id : null;
    historySlot.replaceChildren(history(historyTitle, entries, back));
    if (focused) ($(focused) || $("progressDialogTitle")).focus({ preventScroll: true });
  };
  refreshDetails();
}

function showColumn(id) {
  const data = store.state().board;
  const column = data?.columns[id];
  if (!column) return;
  const columns = store.ordered(data.columns, store.activeColumn);
  const index = columns.findIndex((item) => item.id === id);
  const active = store.activeColumn(column);
  const title = textInput(column.title, { name: "title", required: "", maxlength: "140" });
  const form = editForm([
    field("Name", title),
    field("Description", area(column.description, "description")),
    colorPicker(column.color),
  ], "Save column", async (editor) => {
    const updates = {
      title: titleFrom(editor), description: editor.elements.description.value.trim(),
      color: editor.elements.color.value || "default",
    };
    await store.change((board) => {
      const current = store.requireItem(board.columns, id, column.revision || 0);
      Object.assign(current, updates, { revision: (current.revision || 0) + 1 });
    });
    closeDialog();
    $("edit-column-" + id)?.focus();
  });

  const setStatus = async (status) => {
    await store.change((board) => {
      const current = store.requireItem(board.columns, id);
      if (current.status !== column.status) throw new Error("The column status changed. Reopen it.");
      current.status = status;
      if (status === "active") {
        current.position = store.nextPosition(store.ordered(board.columns, store.activeColumn));
      }
    });
    closeDialog();
  };
  const shift = async (offset) => {
    await store.change((board) => store.shiftColumn(board, id, offset));
    showColumn(id);
  };
  const actions = el("div", { class: "progress-actions" },
    !REMOTE && active ? dialogAction("Focus on this column", () => {
      if (!selectTarget({ columnId: id }, true)) throw new Error("Reset the timer before changing targets.");
    }, { class: "progress-primary" }) : null,
    index > 0 ? dialogAction("Move left", () => shift(-1)) : null,
    index >= 0 && index < columns.length - 1 ? dialogAction("Move right", () => shift(1)) : null,
    active ? dialogAction("Archive column", () => setStatus("archived"))
      : dialogAction("Restore column", () => setStatus("active")),
    column.status !== "deleted" ? dialogAction("Move column to Trash", async () => {
      if (window.confirm('Move “' + column.title + '” and its tasks to Trash? You can restore the column and its history.')) {
        await setStatus("deleted");
      }
    }, { class: "progress-danger" }) : null);
  const hiddenTasks = active ? [] : store.tasksIn(data, id, (task) => !task.deletedAt);
  const extras = hiddenTasks.length ? el("section", { class: "progress-dialog-section" },
      el("h3", {}, "Tasks"), el("ul", { class: "progress-dialog-list" },
        ...hiddenTasks.map((task) => el("li", {}, button(task.title, () => showTask(task.id)),
          task.completedAt ? el("small", {}, "Completed") : null)))) : null;
  openItemDialog(column.title, actions, form, extras, () => {
    const summary = stats.columns.get(id) || blankStats();
    const text = "Total " + duration(summary.total) + " · This week " + duration(summary.week)
      + (active ? "" : column.status === "archived" ? " · Archived" : " · In Trash");
    return { text, entries: summary.sessions };
  }, "Column-only sessions", () => showColumn(id));
}

function showTask(id) {
  const data = store.state().board;
  const task = data?.tasks[id];
  if (!task) return;
  const column = data.columns[task.columnId];
  const visibleColumns = store.ordered(data.columns,
    (item) => store.activeColumn(item) || item.id === task.columnId);
  const destination = el("select", { name: "columnId" },
    ...visibleColumns.map((item) => option(item.id, item.title)));
  destination.value = task.columnId;
  const form = editForm([
    field("Title", textInput(task.title, { name: "title", required: "", maxlength: "140" })),
    field("Column", destination),
    field("Due date", textInput(task.dueDate, { name: "dueDate", type: "date" })),
    field("Description", area(task.description, "description")),
    field("Notes", area(task.notes, "notes")),
  ], "Save task", async (editor) => {
    const updates = {
      title: titleFrom(editor), dueDate: editor.elements.dueDate.value || null,
      description: editor.elements.description.value.trim(), notes: editor.elements.notes.value.trim(),
    };
    const newColumn = destination.value;
    await store.change((board) => {
      const current = store.requireItem(board.tasks, id, task.revision || 0);
      if (current.deletedAt) throw new Error("Restore this task from Trash first.");
      if (newColumn !== current.columnId) store.moveTask(board, id, newColumn);
      Object.assign(current, updates, { revision: (current.revision || 0) + 1 });
    });
    showTask(id);
  });

  const siblings = store.tasksIn(data, task.columnId);
  const index = siblings.findIndex((item) => item.id === id);
  const reorder = async (offset) => {
    await store.change((board) => {
      const current = store.requireItem(board.tasks, id);
      const items = store.tasksIn(board, current.columnId);
      const position = items.findIndex((item) => item.id === id);
      if (position < 0 || position + offset < 0 || position + offset >= items.length) return;
      const before = items[position + (offset < 0 ? -1 : 2)]?.id;
      store.moveTask(board, id, current.columnId, before);
    });
    showTask(id);
  };

  const setDeleted = async (deleted) => {
    if (deleted && !window.confirm('Move “' + task.title + '” to Trash? Its focus history will be kept.')) return;
    const now = serverNow();
    await store.change((board) => {
      const current = store.requireItem(board.tasks, id);
      current.deletedAt = deleted ? (current.deletedAt || now) : null;
    });
    closeDialog();
  };
  const actions = el("div", { class: "progress-actions" },
    !REMOTE && store.activeColumn(column) && store.activeTask(task)
      ? dialogAction("Focus on this task", () => {
        if (!selectTarget({ columnId: task.columnId, taskId: id }, true)) {
          throw new Error("Reset the timer before changing targets.");
        }
      }, { class: "progress-primary" }) : null,
    !task.deletedAt ? dialogAction(task.completedAt ? "Restore to active" : "Complete task", async () => {
      await setCompleted(id, !task.completedAt);
      showTask(id);
    }) : dialogAction("Restore task", () => setDeleted(false)),
    store.activeColumn(column) && index > 0 ? dialogAction("Move up", () => reorder(-1)) : null,
    store.activeColumn(column) && index >= 0 && index < siblings.length - 1
      ? dialogAction("Move down", () => reorder(1)) : null,
    !task.deletedAt ? dialogAction("Move task to Trash", () => setDeleted(true), { class: "progress-danger" }) : null);
  const status = task.deletedAt ? "In Trash" : task.completedAt ? "Completed " + date(task.completedAt) : "Active";
  const editor = task.deletedAt ? el("div", { class: "progress-description" },
    task.dueDate ? el("p", {}, "Due " + dueDate(task.dueDate)) : null,
    task.description ? el("p", {}, task.description) : null,
    task.notes ? el("p", {}, task.notes) : null) : form;
  openItemDialog(task.title, actions, editor, null, () => {
    const summary = stats.tasks.get(id) || blankStats();
    const count = summary.sessions.length;
    const text = [column?.title, status, duration(summary.total), count + (count === 1 ? " session" : " sessions")]
      .filter(Boolean).join(" · ");
    return { text, entries: summary.sessions };
  }, "Focus history", () => showTask(id));
}

function history(title, entries, back) {
  const rows = entries.map((session) => el("li", {},
    button(date(session.endedAt) + " · " + duration(session.elapsedSeconds),
      () => showSession(session, back), { class: "progress-quiet", id: "history-" + session.id }),
    session.note ? el("p", { class: "progress-session-note" }, session.note) : null));
  return el("section", { class: "progress-dialog-section" }, el("h3", {}, title),
    rows.length ? el("ul", { class: "progress-dialog-list" }, ...rows)
      : el("p", { class: "progress-muted" }, "No recorded sessions yet."));
}

export function showSession(session, back = closeDialog) {
  if (!store.state().ready) return;
  const { board, links } = store.state();
  const link = store.sessionLink(session, links);
  const task = board.tasks[link?.taskId];
  const column = board.columns[link?.columnId];
  const originalNote = link?.note || "";
  const actions = el("div", { class: "progress-actions" },
    button("Back", back),
    task && store.activeTask(task) ? dialogAction("Mark task complete", async () => {
      await setCompleted(link.taskId, true);
      showSession(session, back);
    }) : null,
    !REMOTE && store.activeColumn(board.columns[task?.columnId || link?.columnId])
      && (!link.taskId || store.activeTask(task)) ? dialogAction("Continue focusing", () => {
        if (!selectTarget({ columnId: task?.columnId || link.columnId, taskId: link.taskId }, true)) {
          throw new Error("Reset the timer before changing targets.");
        }
        if (window.location.hash === "#timer") $("startBtn").focus();
      }) : null);
  openDialog("Focus session",
    el("p", { class: "progress-muted" }, [task?.title, column?.title, date(session.endedAt),
      duration(session.elapsedSeconds)].filter(Boolean).join(" · ")),
    editForm([field("Session note", area(originalNote, "note", 1000))], "Save note", async (editor) => {
      await store.saveNote(session.id, originalNote, editor.elements.note.value.trim());
      back();
    }), actions);
}

function showArchive() {
  const data = store.state().board;
  const archived = store.ordered(data.columns, (column) => column.status === "archived");
  const deleted = store.ordered(data.columns, (column) => column.status === "deleted");
  const trashed = store.ordered(data.tasks, (task) => task.deletedAt);
  const list = (items) => el("ul", { class: "progress-dialog-list" }, ...items);
  const columnItem = (column) => el("li", {}, button(column.title, () => showColumn(column.id)),
    el("small", {}, "Column"));
  openDialog("Archive & Trash",
    el("section", { class: "progress-dialog-section" }, el("h3", {}, "Archived"),
      archived.length ? list(archived.map(columnItem)) : el("p", { class: "progress-muted" }, "No archived columns.")),
    el("section", { class: "progress-dialog-section" }, el("h3", {}, "Trash"),
      deleted.length || trashed.length ? list([
        ...deleted.map(columnItem),
        ...trashed.map((task) => el("li", {}, button(task.title, () => showTask(task.id)),
          el("small", {}, data.columns[task.columnId]?.title || "Task"))),
      ]) : el("p", { class: "progress-muted" }, "Trash is empty.")));
}

export function init(userUid) {
  uid = userUid;
  const form = $("addColumn");
  const showAdd = $("showAddColumn");
  $("addColumnColors").append(colorPicker());
  function toggleColumnForm(open) {
    form.hidden = !open;
    showAdd.hidden = open;
    (open ? form.elements.title : showAdd).focus();
  }
  showAdd.addEventListener("click", () => toggleColumnForm(true));
  $("cancelColumn").addEventListener("click", () => toggleColumnForm(false));
  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape") toggleColumnForm(false);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    act(event.submitter, async () => {
      const title = titleFrom(form);
      const color = form.elements.color.value || "default";
      const id = crypto.randomUUID();
      await store.change((data) => {
        const position = store.nextPosition(store.ordered(data.columns, store.activeColumn));
        data.columns[id] = { title, color, position, status: "active" };
      });
      form.reset();
      toggleColumnForm(false);
      $("add-task-" + id)?.focus();
    });
  });
  $("progressArchive").addEventListener("click", showArchive);
  $("progressDialog").addEventListener("close", (event) => {
    if (!event.currentTarget.open) event.currentTarget.replaceChildren();
  });
  let watchingBoard = !REMOTE;
  window.addEventListener("sft:viewchange", ({ detail }) => {
    if (!watchingBoard && detail.view === "progress") {
      watchingBoard = true;
      store.init();
    }
    closeDialog();
    render();
  });
  window.addEventListener("sft:sessionsync", ({ detail }) => {
    const status = $("sessionSync");
    status.hidden = !detail.failed;
    status.textContent = detail.failed ? "A session is waiting to sync. The app will retry." : "";
  });
  timer.on("change", () => {
    const state = store.state();
    if (state.ready) reconcileTarget(state.board);
  });
  sessions.onChange(render);
  store.onChange(render);
  if (watchingBoard) store.init();
  // The current-week total rolls over while the app stays open.
  let day = new Date(serverNow()).toDateString();
  setInterval(() => {
    const today = new Date(serverNow()).toDateString();
    if (today !== day) {
      day = today;
      render();
    }
  }, 60_000);
}
