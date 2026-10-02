// Held messages, top left: a note left for the other person that stays
// sealed while their timer runs. They see that something is waiting; the
// text opens when the session ends, or straight away if they aren't in one
// (a message that could only be opened by starting a timer would sit unread
// forever on a day they never start one).
//
// The restraint is the feature. No sound, no title flash, no notification
// of its own, no auto-expand: the envelope turns terracotta and the label
// changes. The one exception is that the end-of-session notification
// mentions a waiting message (alert.js), since that moment is exactly when
// it becomes readable.
//
// ---- Schema, and the app's one cross-write ----
//
//   messages/<recipient>/note : { text, sentAt }   written by the SENDER
//   messages/<recipient>/read : <sentAt it read>   written by the RECIPIENT
//
// Keyed by recipient, so each page listens to exactly one inbox and reads
// it whole. Two separate children rather than one object, and that split is
// load-bearing: security rules apply per path, so the sender can be allowed
// to write `note` but not `read`, and the recipient the reverse. For the
// same reason this code only ever writes those children, never the parent.
//
// One slot per direction, newest wins. What keeps that from silently eating
// a message: the compose box is prefilled with whatever is still unread, so
// sending again visibly edits the waiting message. Once it's read, the box
// clears.

import { refs, TIMESTAMP } from "./firebase.js";
import { THEM } from "./identity.js";
import { DISPLAY_NAME } from "./config.js";
import * as timer from "./timer.js";
import * as ownRoom from "./own-room.js";
import { hasMessage, isUnread, chipLabel, outboxStatus } from "./lib/messages.js";
import { timeOfDay } from "./lib/time.js";

let inbox = null;    // what they sent me
let outbox = null;   // what I sent them, read back for the receipt
// The compose text last filled in from the outbox. The box is only
// overwritten while it still holds exactly this: once the person types,
// their text is newer intent.
let outboxApplied = "";

const $ = (id) => document.getElementById(id);
let widget, input, sendBtn, statusEl;

export function hasUnread() { return isUnread(inbox); }

// The gate is the running timer and nothing else. Paused or idle, there's
// nothing to protect you from. Asked of ownRoom so a phone stays sealed
// while the laptop's timer runs.
function sealed() { return ownRoom.running(); }

export function init() {
  widget = $("messageWidget");
  input = $("messageInput");
  sendBtn = $("messageSend");
  statusEl = $("messageStatus");

  $("composeTo").textContent = DISPLAY_NAME[THEM];
  input.placeholder = "waiting for " + DISPLAY_NAME[THEM] + " when they finish…";

  $("messageChip").addEventListener("click", () => {
    widget.classList.toggle("expanded");
    render();
    renderOutboxStatus();
  });
  input.addEventListener("input", syncSendButton);
  input.addEventListener("blur", applyRemoteOutbox);
  input.addEventListener("keydown", (e) => {
    // Plain Enter stays a newline; Cmd/Ctrl+Enter sends.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  });
  sendBtn.addEventListener("click", send);

  // Sealed-ness follows the timer, so any transition may change the chip:
  // the local timer on a laptop, the published one on a phone.
  timer.on("change", render);
  ownRoom.onChange(render);

  refs.inbox.on("value", (snap) => {
    inbox = snap.val() || null;
    render();
  });
  refs.outbox.on("value", (snap) => {
    outbox = snap.val() || null;
    applyRemoteOutbox();
    renderOutboxStatus();
  });

  syncSendButton();
  render();
  renderOutboxStatus();
}

function render() {
  // The receipt is written when the text is actually on screen: panel open
  // and not sealed. A receipt sent while the panel was shut would be a lie,
  // and it's the only thing telling the sender whether to expect an answer.
  if (hasUnread() && !sealed() && widget.classList.contains("expanded")) markRead();

  const unread = hasUnread();
  $("messageIcon").classList.toggle("live", unread);
  const badge = $("messageBadge");
  badge.classList.toggle("waiting", unread);
  badge.classList.toggle("empty", !unread);
  badge.textContent = chipLabel(unread, sealed());

  renderInbox();
}

function renderInbox() {
  const section = $("inboxSection"), text = $("inboxText");
  if (!hasMessage(inbox)) {
    section.classList.remove("shown");
    return;
  }
  section.classList.add("shown");
  $("inboxFrom").textContent = "From " + DISPLAY_NAME[THEM];
  const locked = hasUnread() && sealed();
  text.textContent = locked ? "Sealed until this session ends." : inbox.note.text;
  text.classList.toggle("locked", locked);
}

function markRead() {
  const stamp = inbox.note.sentAt;
  inbox.read = stamp;   // optimistic, so this render already shows it read
  refs.inbox.child("read").set(stamp).catch(() => {});
}

function renderOutboxStatus() {
  statusEl.textContent = outboxStatus(outbox, DISPLAY_NAME[THEM], timeOfDay);
}

function syncSendButton() {
  sendBtn.disabled = !input.value.trim();
}

// Only overwrites a box the person hasn't touched. Empty once the message
// has been read, so the box clears instead of inviting a resend.
function applyRemoteOutbox() {
  const desired = isUnread(outbox) ? outbox.note.text : "";
  if (input.value !== outboxApplied) return;
  if (document.activeElement === input) return;
  input.value = desired;
  outboxApplied = desired;
  syncSendButton();
}

function send() {
  const text = input.value.trim();
  if (!text) return;
  statusEl.textContent = "sending…";
  refs.outbox.child("note").set({ text, sentAt: TIMESTAMP })
    .then(() => {
      outboxApplied = input.value;
      statusEl.textContent = "waiting for " + DISPLAY_NAME[THEM];
    })
    .catch(() => {
      statusEl.textContent = "couldn't send — check your connection";
    });
}
