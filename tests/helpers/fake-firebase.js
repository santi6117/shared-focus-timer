// An in-memory stand-in for the Firebase compat SDK, served to the page in
// place of the three gstatic <script> files. It implements exactly the surface
// the app uses — ref/child/set/update/push/on/onDisconnect, ServerValue, and
// anonymous auth — and records every write so tests can assert on what the
// app sent, not just on what it rendered.
//
// Test control lives on window.__fakeDb:
//   get(path)         current value at a path
//   set(path, value)  a write from "the other person" or another device
//   writes            every write the app made, in order: {op, path, value}
//
// The tree is mirrored into sessionStorage so a page.reload() keeps the
// database, which is what a real reload does.
(function () {
  const TIMESTAMP = { ".sv": "timestamp" };
  const STORE = "__fakeFirebase";

  const saved = JSON.parse(sessionStorage.getItem(STORE) || "null");
  let tree = saved ? saved.tree : (window.__seedDb || {});
  const writes = saved ? saved.writes : [];
  let pushCount = saved ? saved.pushCount : 0;
  const listeners = [];

  const parts = (p) => String(p).split("/").filter(Boolean);
  const join = (ks) => ks.join("/");
  const clone = (v) => (v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)));
  const isEmptyObj = (v) => v && typeof v === "object" && Object.keys(v).length === 0;

  function read(path) {
    let node = tree;
    for (const k of parts(path)) {
      if (node === null || typeof node !== "object") return null;
      node = node[k];
    }
    if (node === undefined || isEmptyObj(node)) return null;
    return clone(node);
  }

  function resolve(v) {
    if (v && typeof v === "object") {
      if (v[".sv"] === "timestamp") return Date.now();
      const out = {};
      for (const k of Object.keys(v)) out[k] = resolve(v[k]);
      return out;
    }
    return v;
  }

  function writeAt(path, value) {
    const ks = parts(path);
    if (!ks.length) { tree = value || {}; return; }
    let node = tree;
    const trail = [];
    for (let i = 0; i < ks.length - 1; i++) {
      if (node[ks[i]] === null || typeof node[ks[i]] !== "object") node[ks[i]] = {};
      trail.push([node, ks[i]]);
      node = node[ks[i]];
    }
    const last = ks[ks.length - 1];
    if (value === null || value === undefined) delete node[last];
    else node[last] = value;
    // Firebase has no empty objects: prune upward.
    for (let i = trail.length - 1; i >= 0; i--) {
      const [parent, key] = trail[i];
      if (isEmptyObj(parent[key])) delete parent[key];
    }
  }

  function persist() {
    try { sessionStorage.setItem(STORE, JSON.stringify({ tree, writes, pushCount })); } catch (e) {}
  }

  const related = (a, b) => {
    const A = parts(a), B = parts(b);
    const n = Math.min(A.length, B.length);
    for (let i = 0; i < n; i++) if (A[i] !== B[i]) return false;
    return true;
  };

  function snapshot(path) {
    const v = read(path);
    const ks = parts(path);
    return { val: () => clone(v), exists: () => v !== null, key: ks[ks.length - 1] || null };
  }

  function notify(path, addedChild) {
    for (const l of listeners.slice()) {
      if (l.event === "value" && related(l.path, path)) l.cb(snapshot(l.path));
      if (l.event === "child_added" && addedChild && join(parts(l.path)) === join(parts(path))) {
        l.cb(snapshot(join([...parts(path), addedChild])));
      }
    }
  }

  function applyWrite(op, path, value) {
    const resolved = resolve(value);
    writes.push({ op, path: join(parts(path)), value: clone(resolved) });
    if (op === "update") {
      for (const k of Object.keys(resolved)) writeAt(join([...parts(path), ...parts(k)]), resolved[k]);
    } else {
      writeAt(path, resolved);
    }
    persist();
  }

  function makeRef(path) {
    const p = join(parts(path));
    return {
      key: parts(p).pop() || null,
      child: (k) => makeRef(join([...parts(p), ...parts(k)])),
      set(value) {
        applyWrite("set", p, value);
        notify(p);
        return Promise.resolve();
      },
      update(value) {
        applyWrite("update", p, value);
        notify(p);
        return Promise.resolve();
      },
      push(value) {
        const key = "-push" + String(++pushCount).padStart(6, "0");
        applyWrite("push", join([...parts(p), key]), value);
        notify(p, key);
        const ref = makeRef(join([...parts(p), key]));
        return Object.assign(Promise.resolve(ref), ref);
      },
      on(event, cb) {
        listeners.push({ path: p, event, cb });
        // Real Firebase delivers initial data asynchronously.
        queueMicrotask(() => {
          if (p === ".info/connected") return cb({ val: () => true });
          if (p === ".info/serverTimeOffset") return cb({ val: () => window.__serverTimeOffset || 0 });
          if (event === "value") cb(snapshot(p));
          if (event === "child_added") {
            const v = read(p) || {};
            for (const k of Object.keys(v).sort()) cb(snapshot(join([...parts(p), k])));
          }
        });
        return cb;
      },
      onDisconnect() {
        return {
          update: (value) => { writes.push({ op: "onDisconnect.update", path: p, value: clone(value) }); persist(); return Promise.resolve(); },
          set: (value) => { writes.push({ op: "onDisconnect.set", path: p, value: clone(value) }); persist(); return Promise.resolve(); },
        };
      },
    };
  }

  const db = { ref: makeRef };
  const database = () => db;
  database.ServerValue = { TIMESTAMP };

  const authCallbacks = [];
  let user = null;
  const auth = () => ({
    onAuthStateChanged(cb) { authCallbacks.push(cb); if (user) queueMicrotask(() => cb(user)); },
    signInAnonymously() {
      if (window.__authFail) return Promise.reject(new Error("auth disabled"));
      user = { uid: "uid-test-" + (window.__role || "x") };
      // A macrotask, like a real network round trip: the page's later
      // <script> tags must have run before the callback fires.
      setTimeout(() => authCallbacks.forEach((cb) => cb(user)), 0);
      return Promise.resolve({ user });
    },
  });

  window.firebase = { initializeApp: () => ({}), database, auth };

  window.__fakeDb = {
    get: read,
    set(path, value) { writeAt(path, resolve(value)); persist(); notify(path); },
    get writes() { return writes; },
  };
})();
