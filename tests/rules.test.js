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
    for (const p of ["room/santi", "sessions/santi", "categories/kristina", "notes/kristina", "messages/santi"]) {
      assert.ok(!can("read", p, STRANGER), p);
      assert.ok(!can("write", p, STRANGER), p);
    }
    assert.ok(!can("read", "room", DEVICES.santi[0]));
    assert.ok(!can("write", "room/eve", DEVICES.santi[0]));
  });
});
