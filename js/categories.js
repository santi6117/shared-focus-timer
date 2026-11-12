// Categories: the vocabulary in categories/<me> for the focus picker and
// session history.
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

export function options() {
  return Object.entries(catMap).map(([key, value]) => ({ key, label: value.label || key }));
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
  return refs.categories.child(key).update({
    label: (known && known.label) || typed.trim(),
    color: (known && known.color) || pickColor(catMap),
    lastUsedAt: TIMESTAMP,
  });
}

export function recentOptions() {
  return options().sort((a, b) => (catMap[b.key].lastUsedAt || 0) - (catMap[a.key].lastUsedAt || 0));
}

export function setSelection(label) {
  const typed = label.trim();
  const known = catMap[keyFor(typed)]?.label;
  timer.setCategoryLabel(typed ? known || typed : "");
  timer.publishCategoryIfRunning();
}

export function init() {
  refs.categories.on("value", (snap) => {
    catMap = snap.val() || {};
    if (!ready) markReady();
    listeners.forEach((fn) => fn());
  });
  setTimeout(() => { if (!ready) markReady(); }, 5000);
}
