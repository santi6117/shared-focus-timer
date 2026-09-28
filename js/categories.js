// Categories: the vocabulary in categories/<me>, the "working on…" input,
// and the recently-used chips under it.
//
// Categories are derived, not declared. There is no settings screen; the
// set is whatever has been typed, so there's no setup step before starting
// work and each person's vocabulary is independent for free.
//
// History (sessions/) stores only the KEY; this map stores the label and
// colour. That split is what makes renames cheap: a label changes in one
// place and every past session follows, without the append-only log ever
// being rewritten.

import { refs, TIMESTAMP } from "./firebase.js";
import * as timer from "./timer.js";
import {
  UNCATEGORIZED_KEY, OTHER_COLOR, normalizeKey, pickColor,
} from "./lib/categories.js";

let catMap = {};
const listeners = [];

// ---- Waiting for the vocabulary ----
// An empty catMap is ambiguous: "no categories yet" or "Firebase hasn't
// answered yet". Writing a session in the second case would treat an
// established category as brand new and repaint its label and colour. So
// writes wait for the first answer, with a five-second backstop: a session
// logged with a guessed colour beats a session lost to an offline laptop.
let ready = false;
const waiting = [];
function markReady() {
  ready = true;
  while (waiting.length) waiting.shift()();
}
export function whenReady(fn) {
  if (ready) fn();
  else waiting.push(fn);
}

export function onChange(fn) { listeners.push(fn); }

export function keyFor(typed) {
  const t = (typed || "").trim();
  return t ? normalizeKey(t) : UNCATEGORIZED_KEY;
}

export function colorFor(key) {
  if (key === UNCATEGORIZED_KEY) return OTHER_COLOR;
  return (catMap[key] && catMap[key].color) || OTHER_COLOR;
}

// Falls back to the raw key, so a session still renders sensibly if its
// vocabulary entry is somehow missing.
export function labelFor(key) {
  if (key === UNCATEGORIZED_KEY) return "Uncategorized";
  return (catMap[key] && catMap[key].label) || key;
}

// Upsert the vocabulary entry when a session is logged under it. First use
// fixes the label and colour; later uses only bump lastUsedAt, which orders
// the chips. An established label wins over what was just typed, so a
// hurried "thesis" never rewrites "Thesis" everywhere.
export function recordUse(key, typed) {
  if (key === UNCATEGORIZED_KEY) return;
  const known = catMap[key];
  refs.categories.child(key).update({
    label: (known && known.label) || typed.trim(),
    color: (known && known.color) || pickColor(catMap),
    lastUsedAt: TIMESTAMP,
  });
}

// ---- The input and chips ----
let input, chipsEl;

export function init() {
  input = document.getElementById("categoryInput");
  chipsEl = document.getElementById("categoryChips");
  input.value = timer.state().categoryLabel || "";

  input.addEventListener("input", (e) => timer.setCategoryLabel(e.target.value));
  // Published on commit (enter or leaving the box), not per keystroke,
  // or the other person would watch you type.
  const commit = () => { snapToKnownLabel(); timer.publishCategoryIfRunning(); };
  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);

  // Small enough to re-read whole on every change, which also makes this
  // the initial load.
  refs.categories.on("value", (snap) => {
    catMap = snap.val() || {};
    if (!ready) markReady();
    renderChips();
    listeners.forEach((fn) => fn());
  });
  setTimeout(() => { if (!ready) markReady(); }, 5000);

  renderChips();
}

// A typed variant snaps back to the established spelling, so the input
// agrees with what the chips and breakdown show.
function snapToKnownLabel() {
  const typed = (timer.state().categoryLabel || "").trim();
  if (!typed) return;
  const known = catMap[normalizeKey(typed)] && catMap[normalizeKey(typed)].label;
  if (known && known !== typed) {
    timer.setCategoryLabel(known);
    input.value = known;
  }
}

function choose(label) {
  timer.setCategoryLabel(label);
  input.value = label;
  timer.publishCategoryIfRunning();
}

// The five most recently used, newest first. Hidden below two: a row with
// one chip is noise on day one.
function renderChips() {
  const keys = Object.keys(catMap)
    .sort((a, b) => (catMap[b].lastUsedAt || 0) - (catMap[a].lastUsedAt || 0))
    .slice(0, 5);

  chipsEl.innerHTML = "";
  chipsEl.classList.toggle("visible", keys.length >= 2);
  if (keys.length < 2) return;

  for (const key of keys) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "cat-chip";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = colorFor(key);
    const text = document.createElement("span");
    text.textContent = labelFor(key);
    chip.append(swatch, text);
    chip.addEventListener("click", () => choose(labelFor(key)));
    chipsEl.appendChild(chip);
  }
}
