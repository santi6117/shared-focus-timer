// The bottom-right note: one free-text box, private to this person.
//
// Free text rather than a to-do list: a list carries structure to maintain
// (add, tick, delete, reorder), all of it UI competing with the timer. A
// textarea holds a task list, a phone number or half a sentence equally
// well and maintains nothing.
//
// Stored in notes/<me> so it follows this person across browsers and
// laptops. localStorage keeps a copy only so the box can paint instantly on
// load instead of sitting empty for the Firebase round trip, which reads as
// "my notes are gone".

import { refs, TIMESTAMP } from "./firebase.js";
import { ME } from "./identity.js";

const SAVE_DELAY_MS = 800;
const CACHE_KEY = "noteCache:" + ME;

let widget, input, badge, status;
// pendingSave non-null: there are keystrokes not yet written.
// remoteValue non-null: a value from this person's other device, waiting
// for a moment when applying it can't destroy typing in progress.
let pendingSave = null;
let remoteValue = null;

export function init() {
  widget = document.getElementById("noteWidget");
  input = document.getElementById("noteInput");
  badge = document.getElementById("noteBadge");
  status = document.getElementById("noteStatus");

  input.value = localStorage.getItem(CACHE_KEY) || "";

  document.getElementById("noteChip").addEventListener("click", () => {
    widget.classList.toggle("expanded");
    if (widget.classList.contains("expanded")) input.focus();
  });

  input.addEventListener("input", () => {
    // A keystroke is newer intent than any queued remote value. Without
    // this, clicking away could restore what the other laptop sent
    // mid-sentence.
    remoteValue = null;
    renderChip();
    status.textContent = "";
    clearTimeout(pendingSave);
    pendingSave = setTimeout(save, SAVE_DELAY_MS);
  });
  // Leaving the box is when a queued remote value becomes safe to apply.
  input.addEventListener("blur", applyRemote);

  refs.notes.on("value", (snap) => {
    const v = snap.val();
    remoteValue = v && typeof v.text === "string" ? v.text : "";
    applyRemote();
  });

  renderChip();
}

// The first non-blank line, which is what a note like this leads with.
function renderChip() {
  const first = input.value.split("\n").find((l) => l.trim()) || "";
  badge.textContent = first.length > 22 ? first.slice(0, 21).trimEnd() + "…" : (first || "—");
  badge.classList.toggle("empty", !first);
}

// Debounced: a note is typed in bursts, and a write per character would be
// hundreds of round trips for one line.
function save() {
  pendingSave = null;
  localStorage.setItem(CACHE_KEY, input.value);
  status.textContent = "saving…";
  refs.notes
    .set({ text: input.value, updatedAt: TIMESTAMP })
    .then(() => {
      status.textContent = "saved";
      // Only clear if nothing new was typed since, or this would wipe a
      // live "saving…".
      setTimeout(() => { if (pendingSave === null) status.textContent = ""; }, 2000);
    })
    .catch(() => { status.textContent = "offline — kept on this device"; });
}

// Applied only when it can't destroy work in progress: not while the box is
// focused and not while a save is pending.
function applyRemote() {
  if (remoteValue === null) return;
  if (pendingSave !== null) return;
  if (document.activeElement === input) return;
  input.value = remoteValue;
  remoteValue = null;
  localStorage.setItem(CACHE_KEY, input.value);
  renderChip();
}
