// Tests for database.rules.pinned.json, the security rules that tie each slot
// to its owner's devices. Checks, for every device, each read and write the
// app makes, and that the other person's devices and a stranger are refused.
//
// The rules are evaluated here by a small stand-in rather than Firebase's
// own emulator, whose download isn't reachable from the test environment.
// The stand-in is exact for this file because every condition in it is a
// plain auth.uid comparison, and it follows Firebase's one cascading rule:
// an operation is allowed if any rule on the path from the root grants it.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rules = JSON.parse(readFileSync(new URL("../database.rules.pinned.json", import.meta.url))).rules;

// Pull the UIDs back out of the file so a future swap needs no test edit.
const uidsIn = (s) => [...s.matchAll(/auth\.uid === '([^']+)'/g)].map((m) => m[1]);
const DEVICES = {
  santi: uidsIn(rules.room.santi[".write"]),
  kristina: uidsIn(rules.room.kristina[".write"]),
};
const STRANGER = "someStrangerUid0000000000000";

function can(op, path, uid) {
  const grants = (node) =>
    node?.["." + op] !== undefined && Function("auth", `return (${node["." + op]})`)({ uid });
  let node = rules;
  if (grants(node)) return true;
  for (const seg of path.split("/")) {
    node = node[seg] ?? node.$person;
    if (!node) return false;
    if (grants(node)) return true;
  }
  return false;
}

describe("pinned security rules", () => {
  it("has two devices per person and no placeholders left", () => {
    assert.equal(DEVICES.santi.length, 2);
    assert.equal(DEVICES.kristina.length, 2);
    assert.doesNotMatch(JSON.stringify(rules), /_UID'/);
  });

  for (const [me, them] of [["santi", "kristina"], ["kristina", "santi"]]) {
    for (const uid of DEVICES[me]) {
      it(`${me}'s device ${uid.slice(0, 6)}… gets exactly what the app needs`, () => {
        // room: own slot read/write (timer, status, today); peer's slot read-only.
        assert.ok(can("read", `room/${me}`, uid));
        assert.ok(can("write", `room/${me}/status`, uid));
        assert.ok(can("read", `room/${them}`, uid));
        assert.ok(!can("write", `room/${them}`, uid));
        // Shared daily totals: either participant reads, only the owner writes.
        assert.ok(can("read", `activity/${me}/days/2026-10-16`, uid));
        assert.ok(can("write", `activity/${me}/days/2026-10-16`, uid));
        assert.ok(can("read", `activity/${them}/days/2026-10-16`, uid));
        assert.ok(!can("write", `activity/${them}/days/2026-10-16`, uid));
        // Private subtrees: own only.
        for (const sub of ["sessions", "categories", "notes"]) {
          assert.ok(can("read", `${sub}/${me}`, uid), sub);
          assert.ok(can("write", `${sub}/${me}/x`, uid), sub);
          assert.ok(!can("read", `${sub}/${them}`, uid), sub);
          assert.ok(!can("write", `${sub}/${them}/x`, uid), sub);
        }
        // Messages: the one cross-write. Sender writes their note, recipient the receipt.
        assert.ok(can("read", `messages/${me}`, uid));
        assert.ok(can("write", `messages/${them}/note`, uid));
        assert.ok(can("write", `messages/${me}/read`, uid));
        assert.ok(!can("write", `messages/${me}/note`, uid));
        assert.ok(!can("write", `messages/${them}/read`, uid));
        assert.ok(!can("write", `messages/${them}`, uid));
      });
    }
  }

  it("refuses a stranger everywhere, and nothing grants the root or other slots", () => {
    for (const p of ["room/santi", "activity/santi", "sessions/santi", "categories/kristina", "notes/kristina", "messages/santi"]) {
      assert.ok(!can("read", p, STRANGER), p);
      assert.ok(!can("write", p, STRANGER), p);
    }
    assert.ok(!can("read", "room", DEVICES.santi[0]));
    assert.ok(!can("write", "room/eve", DEVICES.santi[0]));
  });
});

// Compatibility proposal mirrors the user-supplied production grants, with
// activity added separately. These auth checks do not emulate validation rules.
const proposed = JSON.parse(readFileSync(new URL("../database.rules.calendar-proposed.json", import.meta.url))).rules;
function proposedCan(op, path, uid) {
  const auth = uid ? { uid } : null;
  let node = proposed;
  for (const part of [null, ...path.split("/")]) {
    if (part !== null) node = node?.[part];
    if (!node) return false;
    if (node["." + op] !== undefined && Function("auth", `return (${node["." + op]})`)(auth)) return true;
  }
  return false;
}
describe("calendar rules compatibility proposal", () => {
  it("uses current Santi devices and denies anonymous or outdated Santi writes", () => {
    for (const uid of ["g6mCVuzg89VR2ttIFr308xtlplu2", "Hkl51J2q3IT8R7OpSdJUEFtQo0v2"]) {
      for (const subtree of ["room", "sessions", "categories", "notes", "activity"]) {
        assert.ok(proposedCan("write", `${subtree}/santi`, uid));
      }
      assert.ok(proposedCan("write", "messages/kristina/note", uid));
      assert.ok(proposedCan("write", "messages/santi/read", uid));
    }
    for (const uid of [null, STRANGER, "gSm4OX7KA5MimXi5unz51JLssOv1", "exa5g4kzTpdEuEHqqCw1HI5S7vC3"]) {
      assert.ok(!proposedCan("write", "activity/santi/days/2026-10-16", uid));
      assert.ok(!proposedCan("read", "sessions/santi", uid));
    }
  });
  it("preserves the supplied broad grants without claiming participant-only privacy", () => {
    for (const subtree of ["room", "sessions", "categories", "notes", "activity"]) {
      assert.ok(proposedCan("read", `${subtree}/kristina`, STRANGER));
      assert.ok(proposedCan("write", `${subtree}/kristina`, STRANGER));
      assert.ok(!proposedCan("read", `${subtree}/kristina`, null));
    }
    assert.ok(proposedCan("read", "room", STRANGER));
    assert.ok(proposedCan("read", "messages", STRANGER));
    assert.ok(proposedCan("read", "activity/santi", STRANGER));
    assert.ok(proposedCan("write", "messages/santi/note", STRANGER));
    assert.ok(!proposedCan("write", "messages/kristina/note", STRANGER));
    assert.ok(proposedCan("write", "messages/kristina/read", STRANGER));
    assert.ok(!proposedCan("write", "messages/santi/read", STRANGER));
    assert.ok(!proposedCan("write", "activity", STRANGER));
  });
});
