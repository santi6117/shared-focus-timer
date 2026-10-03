// The two bottom-left widgets: total focused time (Today / This week / All
// time) and the category split for a chosen period.
//
// The split flips between your day and the other person's. Theirs is
// today only, from the summary they publish (shared-today.js), so while
// it's showing the period pill is fixed at Today.
//
// Both are collapsed chips that expand upward on click. Three always-visible
// numbers would compete with the timer; one small number doesn't.

import * as sessions from "./sessions.js";
import * as categories from "./categories.js";
import * as sharedToday from "./shared-today.js";
import { THEM } from "./identity.js";
import { DISPLAY_NAME } from "./config.js";
import { OTHER_COLOR, totals, breakdown } from "./lib/categories.js";
import { formatTotal, startOfDay, startOfWeek } from "./lib/time.js";

const PERIOD_LABELS = ["Today", "This week", "All time"];
// Defaults to the week: today is often one category or empty, and all time
// stops moving after a month and stops saying anything.
let periodIndex = 1;
// Opens on your own split each load; theirs is a glance, not a mode.
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
  sharedToday.onChange(renderBreakdown);

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

// Both sources reduced to one shape, { grand, top: [{label, color,
// seconds}], restCount, restSeconds }, so there is one drawing path. Mine
// resolves keys through my vocabulary; theirs arrives already resolved.
function mySplit() {
  const b = breakdown(sessions.all(), periodStart());
  return {
    ...b,
    top: b.top.map(({ key, seconds }) => ({
      label: categories.labelFor(key), color: categories.colorFor(key), seconds,
    })),
  };
}

// Every category gets a share of the bar: the top three in their own
// colours, everything else as one neutral segment, so the bar always sums
// to the real total.
function renderBreakdown() {
  const name = DISPLAY_NAME[THEM];
  const b = showingTheirs ? sharedToday.theirs() : mySplit();
  const period = showingTheirs ? "Today" : PERIOD_LABELS[periodIndex];
  const bar = $("shareBar"), rows = $("breakdownRows"), more = $("breakdownMore");

  $("whoseToggle").textContent = showingTheirs ? name : "You";
  $("periodToggle").textContent = period;
  $("periodToggle").disabled = showingTheirs;
  $("breakdownLabel").textContent = showingTheirs ? name : "Split";
  $("breakdownTop").textContent = b && b.top.length ? b.top[0].label : "—";
  bar.innerHTML = "";
  rows.innerHTML = "";

  if (!b || !b.grand) {
    more.textContent = showingTheirs
      ? name + " hasn't logged anything today"
      : "nothing logged " + period.toLowerCase();
    return;
  }
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
