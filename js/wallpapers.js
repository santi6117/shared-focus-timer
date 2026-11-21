// Wallpapers: which background is drawn, and the picker that chooses it.
//
// Every wallpaper's markup is already in index.html inside
// #backgroundLayer; this module only sets #backgroundLayer's data-bg, and
// the CSS shows that one and hides (and so stops animating) the rest.
//
// The choice is stored in localStorage, per device, not in Firebase: a
// laptop and a phone may well want different ones, and it adds nothing to
// the shared data model. Unlocks come from all-time hours in the session
// log (lib/wallpapers.js).
//
// The picker lives on the dashboard. A newly unlocked wallpaper puts a dot
// on the Activity card until the dashboard is actually opened.
//
// ?bg=<id> previews any built wallpaper regardless of hours, without
// saving it. That's for trying them out while they're being designed.

import { ME } from "./identity.js";
import { REMOTE } from "./device.js";
import * as sessions from "./sessions.js";
import {
  WALLPAPERS, isUnlocked, progressLabel, resolveWallpaper, newlyUnlocked,
} from "./lib/wallpapers.js?v=20261121-summer";

const CHOICE_KEY = "wallpaper:" + ME;
const SEEN_KEY = "wallpapersSeen:" + ME;

const $ = (id) => document.getElementById(id);
const preview = new URLSearchParams(window.location.search).get("bg");

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

let current;

export function init() {
  current = resolveWallpaper(load(CHOICE_KEY, null), preview);
  apply();
  // Pause the independent flower layer when either device backgrounds the page.
  const syncMotion = () => $("backgroundLayer").classList.toggle("wallpaper-paused", document.hidden);
  document.addEventListener("visibilitychange", syncMotion);
  syncMotion();
  // The phone has no stats panel to hold a picker; it shows whatever it
  // last had, which is the default unless previewed.
  if (REMOTE) return;

  window.addEventListener("sft:viewchange", (event) => {
    if (event.detail?.view === "dashboard") markSeen();
  });
  sessions.onChange(render);
  render();
}

function apply() {
  $("backgroundLayer").dataset.bg = current;
}

function totalSeconds() {
  return sessions.all().reduce((sum, s) => sum + (s.elapsedSeconds || 0), 0);
}

function choose(id) {
  if (!WALLPAPERS.some((w) => w.id === id && w.built) || !isUnlocked(id, totalSeconds())) return;
  current = id;
  store(CHOICE_KEY, id);
  apply();
  render();
}

function markSeen() {
  const seen = load(SEEN_KEY, []);
  const fresh = newlyUnlocked(totalSeconds(), seen);
  if (fresh.length) store(SEEN_KEY, seen.concat(fresh));
  render();
}

function render() {
  const total = totalSeconds();
  const list = $("wallpaperList");
  list.innerHTML = "";
  let variants;
  for (const w of WALLPAPERS) {
    const open = w.built && isUnlocked(w.id, total);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "wp-option";
    row.dataset.id = w.id;
    row.disabled = !open;
    row.setAttribute("aria-pressed", String(w.id === current));
    row.classList.toggle("selected", w.id === current);

    const thumb = document.createElement("span");
    thumb.className = "wp-thumb thumb-" + w.id;
    const name = document.createElement("span");
    name.className = "wp-name";
    name.textContent = w.name;
    const state = document.createElement("span");
    state.className = "wp-state";
    state.textContent =
      w.id === current ? "on"
      : open ? ""
      : isUnlocked(w.id, total) ? w.hours + " h"
      : progressLabel(w.id, total);

    row.append(thumb, name, state);
    row.addEventListener("click", () => choose(w.id));
    if (w.parent) {
      variants.appendChild(row);
    } else {
      list.appendChild(row);
      if (WALLPAPERS.some((variant) => variant.parent === w.id)) {
        variants = document.createElement("div");
        variants.className = "wp-variants";
        variants.setAttribute("role", "group");
        variants.setAttribute("aria-label", w.name + " variants");
        list.appendChild(variants);
      }
    }
  }
  $("statsChip").classList.toggle("has-new", newlyUnlocked(total, load(SEEN_KEY, [])).length > 0);
}
