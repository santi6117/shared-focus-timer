// The connection to Firebase: sign-in, the database paths this browser
// uses, and the server clock.
//
// The SDK itself is the "compat" build, loaded by plain <script> tags in
// index.html, which puts a global `firebase` on the page before any module
// runs. Every other module gets Firebase from here rather than from that
// global, so this is the one file that knows how it was loaded.
//
// The data model, one subtree per concern, each keyed by person:
//
//   room/<person>        live timer state, status and today's split
//                        summary, read by the other person's page
//   sessions/<person>    append-only log of finished sessions
//   categories/<person>  that person's category vocabulary
//   notes/<person>       that person's private note
//   messages/<person>    a held message FOR that person — the one path the
//                        other person writes to (see messages.js)
//
// Apart from messages/, nobody writes into the other person's subtree.
// database.rules.json enforces that on the server.

import { firebaseConfig } from "./config.js";
import { ME, THEM } from "./identity.js";

const firebase = window.firebase;
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// A placeholder the server replaces with its own clock when the write lands.
// Used for every shared timestamp so two laptops' clocks never have to
// agree.
export const TIMESTAMP = firebase.database.ServerValue.TIMESTAMP;

export const refs = {
  mine:       db.ref("room/" + ME),
  theirs:     db.ref("room/" + THEM),
  // A sibling of room/ rather than inside it, so the presence listener
  // keeps receiving a tiny object instead of the whole history with it.
  sessions:   db.ref("sessions/" + ME),
  categories: db.ref("categories/" + ME),
  notes:      db.ref("notes/" + ME),
  inbox:      db.ref("messages/" + ME),      // what they sent me
  outbox:     db.ref("messages/" + THEM),    // what I send them
  connected:  db.ref(".info/connected"),
};

// Silent anonymous sign-in: no login screen, no password. It exists because
// the database address is visible in the page source; the rules reject any
// client that hasn't signed in. Resolves with the user once signed in.
export function signIn() {
  return new Promise((resolve, reject) => {
    firebase.auth().onAuthStateChanged((user) => { if (user) resolve(user); });
    firebase.auth().signInAnonymously().catch(reject);
  });
}

// Corrects for this browser's clock being off from the server's. Your own
// timer never needs it: it stamps and reads startedAt with your own clock,
// so any error cancels. Reading THEIR timer mixes your clock with the
// server's, so a disagreement shows up directly as lag or lead on the
// presence pill. This tracks the gap and cancels it.
let serverTimeOffset = 0;
export function startClockSync() {
  db.ref(".info/serverTimeOffset").on("value", (snap) => {
    serverTimeOffset = snap.val() || 0;
  });
}
export function serverNow() {
  return Date.now() + serverTimeOffset;
}
