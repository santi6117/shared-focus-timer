// The live sky for the time-of-day wallpapers (Paper hills and Koi pond):
// once a minute, sets each one's colour and position custom properties
// from the local time (the colours themselves are in lib/sky.js and
// lib/pond.js).
//
// Once a minute rather than per frame: the sky changes too slowly for a
// faster update to show, and repainting a full-screen gradient every frame
// for hours is exactly the cost the background rules forbid. The sun and
// moon glide between updates on a one-minute CSS transition, so they never
// visibly step.
//
// It updates both, whichever wallpaper is showing. Setting properties on a
// display:none element repaints nothing, so there's no need to know.
//
// ?sky=<hour> pins the sky to that hour (e.g. ?bg=hills&sky=19.5 or
// ?bg=koi&sky=23), for looking at dusk at noon.

import { skyAt } from "./lib/sky.js";
import { pondAt } from "./lib/pond.js";

const pinned = Number.parseFloat(new URLSearchParams(window.location.search).get("sky"));

function hourNow() {
  if (Number.isFinite(pinned)) return pinned;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

export function init() {
  update();
  setInterval(update, 60000);
}

function update() {
  updateHills();
  updatePond();
}

function updateHills() {
  const el = document.querySelector(".wp-hills");
  if (!el) return;
  const s = skyAt(hourNow());
  const set = (k, v) => el.style.setProperty(k, v);
  set("--sky-top", s.skyTop);
  set("--sky-bottom", s.skyBottom);
  set("--cloud", s.cloud);
  s.hills.forEach((c, i) => set("--hill-" + (i + 1), c));
  set("--stars", s.stars.toFixed(3));
  set("--sun-color", s.sun.color);
  set("--sun-x", s.sun.x + "vw");
  set("--sun-y", s.sun.y + "vh");
  set("--sun-on", s.sun.visible ? "1" : "0");
  set("--moon-x", s.moon.x + "vw");
  set("--moon-y", s.moon.y + "vh");
  set("--moon-on", s.moon.visible ? "1" : "0");
}

function updatePond() {
  const el = document.querySelector(".wp-koi");
  if (!el) return;
  const p = pondAt(hourNow());
  const set = (k, v) => el.style.setProperty(k, v);
  set("--pond-light", p.light);
  set("--sun-color", p.sun.color);
  set("--sun-x", p.sun.x + "vw");
  set("--sun-y", p.sun.y + "vh");
  set("--sun-on", p.sun.visible ? "1" : "0");
  set("--moon-x", p.moon.x + "vw");
  set("--moon-y", p.moon.y + "vh");
  set("--moon-on", p.moon.visible ? "1" : "0");
}
