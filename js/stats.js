// Dashboard focus totals and the period breakdown of the private session log.

import * as sessions from "./sessions.js";
import * as categories from "./categories.js";
import * as progress from "./progress-store.js";
import * as sharedFocus from "./shared-focus.js";
import { THEM } from "./identity.js";
import { DISPLAY_NAME } from "./config.js";
import { CATEGORY_PALETTE, OTHER_COLOR, totals, breakdown } from "./lib/categories.js?v=20261117-categories";
import { formatDuration, formatTotal, startOfDay, startOfWeek } from "./lib/time.js?v=20261117-categories";

const VISIBLE_CATEGORIES = 5;
const openColumns = new Set();
const $ = (id) => document.getElementById(id);
let period = "week";
let showAll = false;

export function init() {
  $("statsChip").addEventListener("click", () => $("statsWidget").classList.toggle("expanded"));
  $("breakdownChip").addEventListener("click", (event) => {
    const expanded = $("breakdownWidget").classList.toggle("expanded");
    event.currentTarget.setAttribute("aria-expanded", expanded);
  });
  const periods = document.querySelectorAll("[data-breakdown-period]");
  for (const button of periods) {
    button.addEventListener("click", () => {
      period = button.dataset.breakdownPeriod;
      for (const control of periods) control.setAttribute("aria-pressed", control === button);
      renderBreakdown();
    });
  }
  $("breakdownMore").addEventListener("click", () => {
    showAll = !showAll;
    renderBreakdown();
  });

  sessions.onChange(renderAll);
  categories.onChange(renderBreakdown);
  progress.onChange(renderBreakdown);
  $("statPartnerLabel").textContent = DISPLAY_NAME[THEM] + " · All time";
  sharedFocus.init(renderPartnerTotal);

  // Re-sum so Today and This week roll forward without a refresh.
  setInterval(renderAll, 30_000);
  renderAll();
}

function renderAll() {
  renderTotals();
  renderBreakdown();
}

function renderTotals() {
  const now = Date.now();
  const log = sessions.all();
  const t = totals(log, { startOfToday: startOfDay(now), startOfWeek: startOfWeek(now) });
  $("chipValue").textContent = formatTotal(t.today);
  $("statToday").textContent = formatTotal(t.today);
  $("statWeek").textContent = formatTotal(t.week);
  $("statAll").textContent = formatTotal(t.all);
  $("statCount").textContent = log.length === 1 ? "1 session logged" : log.length + " sessions logged";
}

function renderPartnerTotal() {
  const total = sharedFocus.partnerTotal();
  $("statPartnerTotal").textContent = total === null ? "—" : formatTotal(total);
}

function periodStart(now) {
  if (period === "today") return startOfDay(now);
  if (period === "week") return startOfWeek(now);
  return 0;
}

function categoryAppearance(group, board) {
  if (!group.columnId) {
    return { label: categories.labelFor(group.categoryKey), color: categories.colorFor(group.categoryKey) };
  }
  const column = board?.columns[group.columnId];
  // Give columns with the default color a stable swatch even as their rank changes.
  const hue = [...group.columnId].reduce((hash, letter) => (hash * 31 + letter.codePointAt(0)) % CATEGORY_PALETTE.length, 0);
  return {
    label: column?.title || "Progress column",
    columnColor: column?.color || "default",
    color: "var(--column-accent, " + CATEGORY_PALETTE[hue] + ")",
  };
}

function rowContent(row, label, seconds) {
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = label;
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = formatDuration(seconds);
  row.append(name, time);
}

function categoryRow(group, board) {
  const appearance = categoryAppearance(group, board);
  const row = document.createElement(group.columnId ? "summary" : "div");
  row.className = "cat-row";
  const swatch = document.createElement("span");
  swatch.className = "swatch";
  paint(swatch, appearance);
  row.append(swatch);
  rowContent(row, appearance.label, group.seconds);
  if (!group.columnId) return row;

  const details = document.createElement("details");
  details.className = "cat-column";
  details.dataset.columnId = group.columnId;
  details.open = openColumns.has(group.columnId);
  details.append(row);

  const tasks = document.createElement("div");
  tasks.className = "cat-tasks";
  // Keep direct column time below the tasks so it reads as part of the same total.
  const ranked = [...group.tasks].sort(([a, aTime], [b, bTime]) =>
    Number(a === null) - Number(b === null) || bTime - aTime);
  for (const [taskId, seconds] of ranked) {
    const task = document.createElement("div");
    task.className = "cat-task";
    const label = taskId ? board?.tasks[taskId]?.title || "Progress task" : "Without a task";
    rowContent(task, label, seconds);
    tasks.append(task);
  }
  details.append(tasks);
  return details;
}

function paint(element, { color, columnColor }) {
  if (columnColor) element.dataset.color = columnColor;
  element.style.background = color;
}

function segment(seconds, grand, appearance) {
  const el = document.createElement("div");
  el.style.width = (seconds / grand * 100) + "%";
  paint(el, appearance);
  return el;
}

function renderBreakdown() {
  const { board, links } = progress.state();
  const { grand, ranked } = breakdown(sessions.all(), periodStart(Date.now()),
    (session) => progress.sessionLink(session, links));
  const bar = $("shareBar");
  const rows = $("breakdownRows");
  const more = $("breakdownMore");
  const visible = showAll ? ranked : ranked.slice(0, VISIBLE_CATEGORIES);
  const otherSeconds = grand - visible.reduce((sum, group) => sum + group.seconds, 0);

  // A time edit or clock refresh can reorder rows. Preserve the disclosures
  // and keyboard focus by column ID, independently of each column's rank.
  const focusedColumn = rows.contains(document.activeElement)
    ? document.activeElement.closest("[data-column-id]")?.dataset.columnId : null;
  for (const row of rows.querySelectorAll("[data-column-id]")) {
    if (row.open) openColumns.add(row.dataset.columnId);
    else openColumns.delete(row.dataset.columnId);
  }

  const total = sessions.isInitialLoadComplete()
    ? grand ? formatDuration(grand) + " total" : "No focus time in this period"
    : "Loading focus time…";
  if ($("breakdownTotal").textContent !== total) $("breakdownTotal").textContent = total;
  $("breakdownTop").textContent = grand ? formatDuration(grand) : "—";
  bar.hidden = !grand;
  bar.replaceChildren(...visible.map((group) =>
    segment(group.seconds, grand, categoryAppearance(group, board))));
  if (otherSeconds) bar.append(segment(otherSeconds, grand, { color: OTHER_COLOR }));
  rows.replaceChildren(...visible.map((group) => categoryRow(group, board)));

  more.hidden = ranked.length <= VISIBLE_CATEGORIES;
  more.setAttribute("aria-expanded", showAll);
  more.textContent = showAll ? "Show top " + VISIBLE_CATEGORIES
    : "Show " + (ranked.length - VISIBLE_CATEGORIES) + " more · " + formatDuration(otherSeconds);
  if (focusedColumn) {
    const summary = rows.querySelector('[data-column-id="' + CSS.escape(focusedColumn) + '"] summary');
    (summary || (more.hidden ? $("breakdownChip") : more)).focus({ preventScroll: true });
  }
}
