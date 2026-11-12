import { ME } from "./identity.js";
import * as categories from "./categories.js";
import * as timer from "./timer.js";
import * as store from "./progress-store.js";

const $ = (id) => document.getElementById(id);
const categoryChoice = (label, key = categories.keyFor(label)) => ({
  id: "category:" + key, key, label, detail: "Category",
});
const targetId = (target) => target.taskId ? "task:" + target.taskId : "column:" + target.columnId;

let storageKey;
let recent = [];
let browsing = false;
let editingCategory = false;
let previousTarget;
let timeContext;

function remember(choice) {
  recent = [{ id: choice.id, label: choice.target ? undefined : choice.label },
    ...recent.filter((item) => item.id !== choice.id)].slice(0, 12);
  localStorage.setItem(storageKey, JSON.stringify(recent));
}

function availableChoices(board, categoryLabel, locked) {
  const choices = new Map(categories.recentOptions().map(({ key, label }) => {
    const choice = categoryChoice(label, key);
    return [choice.id, choice];
  }));
  // A category can be selected before it has been used in a recorded session.
  for (const { id, label } of recent) {
    if (id.startsWith("category:") && label && !choices.has(id)) choices.set(id, categoryChoice(label));
  }
  const currentCategory = categoryLabel?.trim();
  if (currentCategory) {
    const choice = categoryChoice(currentCategory);
    if (!choices.has(choice.id)) choices.set(choice.id, choice);
  }
  if (board && !locked && !editingCategory) {
    const visibleColumn = timeContext ? (column) => column.status !== "deleted" : store.activeColumn;
    const visibleTask = timeContext ? (task) => !task.deletedAt : store.activeTask;
    for (const column of store.ordered(board.columns, visibleColumn)) {
      choices.set("column:" + column.id, {
        id: "column:" + column.id, label: column.title, detail: "Column",
        target: { columnId: column.id },
      });
      for (const task of store.tasksIn(board, column.id, visibleTask)) {
        choices.set("task:" + task.id, {
          id: "task:" + task.id, label: task.title, detail: "Task · " + column.title,
          target: { taskId: task.id, columnId: column.id },
        });
      }
    }
  }
  return choices;
}

function applyChoice(choice) {
  if (timeContext) {
    timeContext.choose(choice, editingCategory);
    $("focusPicker").close();
    return;
  }
  if (choice.target) {
    if (!store.state().ready || !timer.setFocusTarget(choice.target)) return;
  } else {
    if (!editingCategory && !timer.focusTargetLocked() && timer.state().focusTarget) timer.setFocusTarget(null);
    categories.setSelection(choice.label);
    if (!editingCategory && choice.label) remember(choice);
  }
  $("focusPicker").close();
  render();
}

function resultButton(choice) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "focus-result";
  const label = document.createElement("span");
  label.textContent = choice.label;
  if (choice.create) label.textContent = "Use “" + choice.label + "” as category";
  const detail = document.createElement("small");
  detail.textContent = choice.create ? "" : choice.detail;
  button.append(label, detail);
  button.addEventListener("click", () => applyChoice(choice));
  return button;
}

function render() {
  const state = store.state();
  const board = state.ready ? state.board : null;
  const { focusTarget, categoryLabel: timerCategory } = timer.state();
  const timerTarget = board ? focusTarget : null;
  $("focusChoice").textContent = targetLabel(timerTarget) || timerCategory || "Working on…";
  if (!$("focusPicker").open) return;

  const target = timeContext ? timeContext.target : timerTarget;
  const categoryLabel = timeContext ? timeContext.categoryLabel : timerCategory;
  const locked = !timeContext && timer.focusTargetLocked();
  const search = $("focusSearch");
  const term = search.value.trim();
  const canSearch = !locked || !target || editingCategory;
  const choices = availableChoices(board, categoryLabel, locked);
  const lower = term.toLocaleLowerCase();
  let results;
  if (!canSearch) {
    results = [];
  } else if (term) {
    results = [...choices.values()].filter(({ label, detail }) => label.toLocaleLowerCase().includes(lower)
      || detail.toLocaleLowerCase().includes(lower));
    const category = categoryChoice(term);
    if (!timeContext?.filter && term.length <= 40 && category.key !== categories.keyFor("") && !choices.has(category.id)) {
      results.push({ ...category, create: true });
    }
  } else if (browsing || editingCategory) {
    results = [...choices.values()];
  } else {
    const selected = target ? targetId(target) : categoryLabel ? categoryChoice(categoryLabel).id : null;
    const recentIds = new Set(recent.length ? recent.map(({ id }) => id) : [selected]);
    for (const id of choices.keys()) if (id.startsWith("category:")) recentIds.add(id);
    results = [...recentIds].map((id) => choices.get(id)).filter(Boolean).slice(0, 2);
  }

  const resultsEl = $("focusResults");
  const focused = resultsEl.contains(document.activeElement) ? document.activeElement.dataset.choice : null;
  resultsEl.setAttribute("aria-label", !term && !browsing && !editingCategory ? "Recent choices" : "Focus choices");
  resultsEl.replaceChildren(...results.map((choice) => {
    const button = resultButton(choice);
    button.dataset.choice = choice.id;
    return button;
  }));
  $("focusPickerTitle").textContent = editingCategory ? "Category" : timeContext?.title || "Working on";
  $("focusPickerHint").hidden = Boolean(timeContext) || (!editingCategory && !locked);
  $("focusPickerHint").textContent = editingCategory
    ? "Your partner can see this category while you focus."
    : "Reset to end this session before changing its task or column.";
  search.hidden = !canSearch;
  if (focused) {
    const previous = [...resultsEl.children].find((button) => button.dataset.choice === focused);
    (previous || (canSearch ? search : $("closeFocusPicker"))).focus();
  }
  search.placeholder = board && !editingCategory && !locked
    ? "Search tasks, columns, or categories" : "Search or type a category";
  const empty = $("focusEmpty");
  empty.hidden = !canSearch || !term || results.length > 0;
  empty.textContent = "No matches";
  $("browseFocusChoices").hidden = !canSearch || editingCategory || browsing || Boolean(term) || !choices.size;
  const edit = $("editFocusCategory");
  edit.hidden = !target || Boolean(timeContext?.filter);
  edit.textContent = editingCategory ? "Back to focus choices" : categoryLabel ? "Category · " + categoryLabel : "Add category";
  const clear = $("clearFocusChoice");
  clear.hidden = editingCategory ? !categoryLabel : !(categoryLabel || target) || (locked && Boolean(target));
  clear.textContent = editingCategory ? "Clear category" : timeContext?.filter ? "Clear filter" : "Clear selection";
}

export function targetLabel(target) {
  if (!target) return "";
  const board = store.state().board;
  return board?.tasks[target.taskId]?.title || board?.columns[target.columnId]?.title || "Private focus";
}

export function openForTime(context) {
  timeContext = context;
  browsing = false;
  editingCategory = false;
  const search = $("focusSearch");
  search.value = "";
  $("focusPicker").showModal();
  render();
  (search.hidden ? $("closeFocusPicker") : search).focus();
}

export function init(uid) {
  storageKey = "recentFocusChoices:" + ME + ":" + uid;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved)) recent = saved.filter((item) => typeof item?.id === "string");
  } catch { /* Ignore unreadable saved choices. */ }

  const dialog = $("focusPicker");
  const search = $("focusSearch");
  const opener = $("openFocusPicker");
  opener.hidden = false;
  opener.addEventListener("click", () => openForTime(null));
  $("closeFocusPicker").addEventListener("click", () => dialog.close());
  $("browseFocusChoices").addEventListener("click", () => {
    browsing = true;
    render();
    search.focus();
  });
  $("editFocusCategory").addEventListener("click", () => {
    editingCategory = !editingCategory;
    search.value = "";
    render();
    (search.hidden ? $("editFocusCategory") : search).focus();
  });
  $("clearFocusChoice").addEventListener("click", () => applyChoice(categoryChoice("")));
  search.addEventListener("input", render);
  search.addEventListener("keydown", (event) => {
    if (event.isComposing || !["Enter", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...$("focusResults").children];
    if (event.key === "ArrowDown") buttons[0]?.focus();
    else if (search.value.trim()) {
      const exact = buttons.find((button) => button.firstChild.textContent.toLocaleLowerCase()
        === search.value.trim().toLocaleLowerCase());
      (exact || buttons[0])?.click();
    }
  });
  window.addEventListener("sft:viewchange", () => { if (dialog.open) dialog.close(); });
  timer.on("target", () => {
    const target = timer.state().focusTarget;
    const id = target ? targetId(target) : null;
    if (id && id !== previousTarget && store.state().ready) remember({ id, target });
    previousTarget = id;
    render();
  });
  previousTarget = timer.state().focusTarget ? targetId(timer.state().focusTarget) : null;
  timer.on("change", render);
  store.onChange(render);
  categories.onChange(render);
  render();
}
