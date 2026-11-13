// The two bottom-left widgets: total focused time (Today / This week / All
// time) and the category split, which can show the partner’s lifetime total.

import * as sessions from "./sessions.js";
import * as categories from "./categories.js";
import * as sharedFocus from "./shared-focus.js";
import { THEM } from "./identity.js";
import { DISPLAY_NAME } from "./config.js";
import { OTHER_COLOR, totals, breakdown } from "./lib/categories.js";
import { formatTotal, startOfDay, startOfWeek } from "./lib/time.js";

const PERIOD_LABELS = ["Today", "This week", "All time"];
// Defaults to the week: today is often one category or empty, and all time
// stops moving after a month and stops saying anything.
let periodIndex = 1;
// Each visit opens on your own category split.
let showingTheirs = false;

const $ = (id) => document.getElementById(id);

export function init() {
  $("statsChip").addEventListener("click", () => $("statsWidget").classList.toggle("expanded"));
  $("breakdownChip").addEventListener("click", () => $("breakdownWidget").classList.toggle("expanded"));
  $("periodToggle").addEventListener("click", () => {
    periodIndex = (periodIndex + 1) % PERIOD_LABELS.length;
    renderBreakdown();
  });
  $("whoseToggle").addEventListener("click", () => {
    showingTheirs = !showingTheirs;
    renderBreakdown();
  });

  sessions.onChange(renderAll);
  categories.onChange(renderBreakdown);
  sharedFocus.init(renderBreakdown);

  // Re-summed twice a minute so the buckets roll over at midnight without a
  // refresh. A loop over a few hundred numbers.
  setInterval(renderAll, 30000);
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

function periodStart() {
  const now = Date.now();
  if (periodIndex === 0) return startOfDay(now);
  if (periodIndex === 1) return startOfWeek(now);
  return 0;
}

function swatchRow(color, label, seconds) {
  const row = document.createElement("div");
  row.className = "cat-row";
  const swatch = document.createElement("span");
  swatch.className = "swatch";
  swatch.style.background = color;
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = label;
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = formatTotal(seconds);
  row.append(swatch, name, time);
  return row;
}

function segment(seconds, grand, color) {
  const el = document.createElement("div");
  el.style.width = (seconds / grand * 100) + "%";
  el.style.background = color;
  return el;
}

// Resolve the category keys for display using the owner's vocabulary.
function mySplit() {
  const b = breakdown(sessions.all(), periodStart());
  return {
    ...b,
    top: b.top.map(({ key, seconds }) => ({
      label: categories.labelFor(key), color: categories.colorFor(key), seconds,
    })),
  };
}

function renderBreakdown() {
  const name = DISPLAY_NAME[THEM];
  const bar = $("shareBar"), rows = $("breakdownRows"), more = $("breakdownMore");

  $("whoseToggle").textContent = showingTheirs ? name : "You";
  $("periodToggle").textContent = showingTheirs ? "All time" : PERIOD_LABELS[periodIndex];
  $("periodToggle").disabled = showingTheirs;
  $("breakdownLabel").textContent = showingTheirs ? name : "Categories";
  bar.hidden = showingTheirs;
  bar.replaceChildren();
  rows.replaceChildren();

  if (showingTheirs) {
    const total = sharedFocus.partnerTotal();
    const formatted = total === null ? "—" : formatTotal(total);
    $("breakdownTop").textContent = formatted;
    more.textContent = total === null
      ? "Lifetime focus time unavailable"
      : "Lifetime focus time · " + formatted;
    return;
  }

  const b = mySplit();
  $("breakdownTop").textContent = b.top[0]?.label ?? "—";
  if (!b.grand) {
    more.textContent = "nothing logged " + PERIOD_LABELS[periodIndex].toLowerCase();
    return;
  }
  // The neutral remainder keeps the bar proportional to the full total.
  for (const { label, color, seconds } of b.top) {
    bar.appendChild(segment(seconds, b.grand, color));
    rows.appendChild(swatchRow(color, label, seconds));
  }
  if (b.restSeconds > 0) {
    bar.appendChild(segment(b.restSeconds, b.grand, OTHER_COLOR));
    more.textContent = "+ " + b.restCount + " more · " + formatTotal(b.restSeconds);
  } else {
    more.textContent = "";
  }
}
