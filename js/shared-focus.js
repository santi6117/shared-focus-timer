// Share one lifetime total per person in the room. Each laptop sums its
// own current session history, so this includes older sessions and edits
// without depending on calendar sharing or exposing individual records.

import { refs } from "./firebase.js";
import * as sessions from "./sessions.js";

let theirs = null;

export function partnerTotal() { return theirs; }

export function init(onPartnerChange) {
  let connected = false;
  let lastPublished = null;
  const totalRef = refs.mine.child("lifetimeFocusSeconds");

  function publish() {
    if (!connected || !sessions.isInitialLoadComplete()) return;
    const total = sessions.all().reduce((sum, session) => sum + session.elapsedSeconds, 0);
    if (total === lastPublished) return;

    lastPublished = total;
    totalRef.set(total).catch((error) => {
      if (lastPublished === total) lastPublished = null;
      console.error("Could not share lifetime focus time:", error);
    });
  }

  sessions.onChange(publish);
  refs.connected.on("value", (snap) => {
    connected = snap.val() === true;
    publish();
  });
  refs.theirs.child("lifetimeFocusSeconds").on("value", (snap) => {
    const total = snap.val();
    theirs = Number.isSafeInteger(total) && total >= 0 ? total : null;
    onPartnerChange();
  });
}
