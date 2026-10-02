// Your status: what you're up to when you're not focusing ("eating",
// "out with friends"), shown in the other person's presence pill in place
// of "not working".
//
// Stored at room/<me>/status as { text, setAt }, next to the timer fields,
// rather than in a subtree of its own: the presence pill already listens to
// room/, and the security rules already allow it, so nothing new has to be
// pasted into the Firebase console.
//
// Hidden while the timer runs, since "focusing on Thesis" says it all then.
// Starting a timer clears it: a status from before the session is stale by
// the time the session ends. It is NOT cleared on disconnect, so a status
// set from the phone stays up after the phone locks.
//
// Free text plus a few presets, rather than presets only: the presets cover
// the usual answers in one tap, and anything else is just typed.

import { refs, TIMESTAMP, serverNow } from "./firebase.js";
import { REMOTE } from "./device.js";
import * as timer from "./timer.js";
import * as ownRoom from "./own-room.js";
import { normalizeStatus, formatAgo } from "./lib/status.js";

const PRESETS = ["eating", "sleeping", "out with friends", "errands", "in lectures"];

const $ = (id) => document.getElementById(id);
let row, input, ageEl, clearBtn;

function current() { return ownRoom.get().status || null; }

export function init() {
  row = $("statusRow");
  input = $("statusInput");
  ageEl = $("statusAge");
  clearBtn = $("statusClear");

  const presets = $("statusPresets");
  for (const text of PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "status-preset";
    b.textContent = text;
    // On a laptop the presets only show while the box has focus. Keeping
    // focus through the press stops them vanishing before the click lands.
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.addEventListener("click", () => { input.value = text; set(text); input.blur(); });
    presets.appendChild(b);
  }

  // "change" fires on Enter and on leaving an edited box, not per keystroke.
  input.addEventListener("change", () => set(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
  clearBtn.addEventListener("click", () => { input.value = ""; set(""); });

  // Laptop only: a phone never starts the timer. Cleared wherever it was
  // set, since the laptop clears the shared copy.
  if (!REMOTE) timer.on("start", () => { if (current()) set(""); });

  ownRoom.onChange(render);
  render();
}

function set(raw) {
  const text = normalizeStatus(raw);
  const now = current();
  if ((now ? now.text : "") === text) { render(); return; }
  refs.mine.child("status").set(text ? { text, setAt: TIMESTAMP } : null);
}

// Called on every change to room/<me>, and from the render loop so the age
// keeps counting.
export function render() {
  row.classList.toggle("hidden", ownRoom.running());
  const s = current();
  // Never overwrite what's being typed.
  if (document.activeElement !== input) input.value = s ? s.text : "";
  clearBtn.classList.toggle("shown", !!s);
  ageEl.textContent = s && typeof s.setAt === "number"
    ? "set " + formatAgo(serverNow() - s.setAt)
    : "";
}
