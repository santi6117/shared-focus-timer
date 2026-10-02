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
// The picker lives inside the stats panel, since unlocks are about hours.
// A newly unlocked wallpaper puts a dot on the stats chip until the panel
// is opened. No toast, no sound: same restraint as messages.
//
// ?bg=<id> previews any built wallpaper regardless of hours, without
// saving it. That's for trying them out while they're being designed.

import { ME } from "./identity.js";
import { REMOTE } from "./device.js";
import * as sessions from "./sessions.js";
import {
  WALLPAPERS, isUnlocked, progressLabel, resolveWallpaper, newlyUnlocked,
} from "./lib/wallpapers.js";

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
  // The phone has no stats panel to hold a picker; it shows whatever it
  // last had, which is the default unless previewed.
  if (REMOTE) return;

  $("statsChip").addEventListener("click", () => {
    if ($("statsWidget").classList.contains("expanded")) markSeen();
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
  if (!isUnlocked(id, totalSeconds())) return;
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
  for (const w of WALLPAPERS) {
    const open = w.built && isUnlocked(w.id, total);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "wp-option";
    row.dataset.id = w.id;
    row.disabled = !open;
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
      : isUnlocked(w.id, total) ? "soon"     // earned, not drawn yet
      : progressLabel(w.id, total);

    row.append(thumb, name, state);
    row.addEventListener("click", () => choose(w.id));
    list.appendChild(row);
  }
  $("statsChip").classList.toggle("has-new", newlyUnlocked(total, load(SEEN_KEY, [])).length > 0);
}
