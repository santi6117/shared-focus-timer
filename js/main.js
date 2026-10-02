// Startup. The one place that decides what runs in what order.
//
// Order matters in exactly three ways, all visible here:
//   1. Nothing touches the database until sign-in completes; the security
//      rules reject a signed-out client.
//   2. Every module subscribes to the timer's events before crash recovery
//      runs, because recovery can announce a session that needs logging.
//   3. The render loop starts last, after all state is loaded and recovered.
//
// A laptop and a phone boot differently (see device.js). The phone skips
// everything that runs or publishes a timer: the controls, the alert,
// crash recovery and the disconnect instruction.

import { signIn, startClockSync } from "./firebase.js";
import { ME } from "./identity.js";
import { REMOTE } from "./device.js";
import * as timer from "./timer.js";
import * as ownRoom from "./own-room.js";
import * as sessions from "./sessions.js";
import * as categories from "./categories.js";
import * as timerView from "./timer-view.js";
import * as remoteView from "./remote-view.js";
import * as presence from "./presence.js";
import * as status from "./status.js";
import * as stats from "./stats.js";
import * as note from "./note.js";
import * as messages from "./messages.js";
import * as alert from "./alert.js";

async function boot() {
  let user;
  try {
    user = await signIn();
  } catch (err) {
    console.error("Anonymous sign-in failed:", err);
    document.getElementById("presenceState").textContent = "sign-in failed";
    return;
  }

  // Shown quietly in the corner: the anonymous UID has to be copied into
  // the security rules by hand, and devtools is a worse place to find it.
  document.getElementById("uidDebug").textContent =
    ME + (REMOTE ? " · phone" : "") + " · uid " + user.uid;

  startClockSync();
  // Loaded on a phone too, where it sits idle: other modules read its
  // state, and an idle timer that never acts is simpler than a missing one.
  timer.init();
  if (!REMOTE) timer.armDisconnect();
  ownRoom.init();
  sessions.init();
  categories.init();
  (REMOTE ? remoteView : timerView).init();
  presence.init();
  status.init();
  stats.init();
  note.init();
  messages.init();
  if (!REMOTE) alert.init();

  if (!REMOTE) {
    timer.recoverInterruptedRun();
    // Re-arm the zero-crossing wakeup for a run that was already going
    // when the page loaded.
    timer.scheduleAlarm();
  }

  const frame = () => {
    if (REMOTE) {
      remoteView.render();
    } else {
      timer.tick();
      timerView.render();
    }
    presence.render();
    status.render();
  };
  setInterval(frame, 250);
  frame();
}

boot();
