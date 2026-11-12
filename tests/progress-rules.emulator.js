// Run against a local Realtime Database emulator, in a dedicated demo namespace.
// Uses the emulator's admin token for setup and unsigned mock Auth tokens for
// the participant requests. There are no Firebase credentials in these tests.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const project = "demo-sft-progress-test";
const port = Number(process.env.PROGRESS_EMULATOR_PORT || 9000);
assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function token(uid) {
  const now = Math.floor(Date.now() / 1000);
  return encode({ alg: "none", typ: "JWT" }) + "." + encode({
    iss: "https://securetoken.google.com/" + project,
    aud: project, sub: uid, user_id: uid, iat: now, exp: now + 3600,
    auth_time: now, firebase: { sign_in_provider: "anonymous" },
  }) + ".";
}

async function request(path, { uid, admin, body, expected = 200 } = {}) {
  const url = new URL("http://127.0.0.1:" + port + "/" + path + ".json");
  url.searchParams.set("ns", project);
  const headers = { "Content-Type": "application/json" };
  if (admin) headers.Authorization = "Bearer owner";
  if (uid) url.searchParams.set("auth", token(uid));
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "PUT",
    headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${path} as ${uid || "signed out"}: ${JSON.stringify(result)}`);
  return result;
}

test("Firebase enforces enrollment for both boards and their canonical session logs", async () => {
  const rules = JSON.parse(await readFile(new URL("../database.rules.progress-proposed.json", import.meta.url)));
  await request(".settings/rules", { admin: true, body: rules });
  await request("", { admin: true, body: null });

  const alex = "progress-test-santi";
  const peer = "progress-test-kristina";
  const second = "progress-test-second-santi-device";
  const stranger = "progress-test-stranger";
  const work = { elapsedSeconds: 60, endedAt: Date.now() };

  // Before enrollment the current app works and Progress denies even a signed-in browser.
  await request("sessions/kristina/legacy", { uid: stranger, body: work });
  await request("progress/kristina/board", { uid: peer, expected: 401 });
  await request("progressAccess/enabled/kristina", { uid: peer, body: true, expected: 401 });

  await request("progressAccess", { admin: true, body: {
    devices: { [alex]: "santi", [second]: "santi", [peer]: "kristina" },
    enabled: { santi: true, kristina: true },
  } });

  for (const [owner, uid, other] of [["santi", alex, peer], ["kristina", peer, alex]]) {
    const board = { columns: { c: { title: "Private " + owner } } };
    await request("progress/" + owner + "/board", { uid, body: board });
    assert.deepEqual(await request("progress/" + owner + "/board", { uid }), board);
    await request("sessions/" + owner + "/run", { uid, body: work });
    await request("progress/" + owner + "/links/run", { uid, body: { columnId: "c", note: "Private note" } });
    assert.deepEqual(await request("sessions/" + owner + "/run", { uid }), work);
    for (const denied of [other, stranger, null]) {
      for (const path of ["progress/" + owner + "/board", "progress/" + owner + "/links/run",
        "sessions/" + owner + "/run"]) {
        await request(path, { uid: denied, expected: 401 });
        await request(path, { uid: denied, body: null, expected: 401 });
      }
    }
  }
  assert.ok(await request("progress/santi/board", { uid: second }));
  await request("progress/santi/board", { uid: second, body: { settings: { test: true } } });
  await request("progress", { uid: alex, expected: 401 });
  await request("progress/unrecognized", { uid: alex, body: { test: true }, expected: 401 });
  await request("progressAccess", { uid: alex, expected: 401 });
  await request("progressAccess/devices/" + stranger, { uid: alex, body: "santi", expected: 401 });
  await request("room/kristina/status", { uid: peer, body: "away" });
  assert.equal(await request("room/kristina/status", { uid: alex }), "away");
  await request("activity/kristina/days/today", { uid: peer, body: 60 });
  assert.equal(await request("activity/kristina/days/today", { uid: alex }), 60);
});
