// Which person this browser is: ME, and the other one, THEM.
//
// Chosen over two edited copies of the site: a URL parameter, read once and
// remembered, so both people run byte-identical code. Visit once as
// ?me=santi or ?me=kristina; localStorage remembers after that.
//
// Resolved when this module first loads. With no role set, it replaces the
// page with instructions and throws, which stops every module that imports
// it — nothing below this point can run without knowing who "me" is.

import { DISPLAY_NAME } from "./config.js";

const ROLES = Object.keys(DISPLAY_NAME);

function resolveRole() {
  const fromUrl = new URLSearchParams(window.location.search).get("me");
  if (ROLES.includes(fromUrl)) {
    localStorage.setItem("myRole", fromUrl);
    return fromUrl;
  }
  const stored = localStorage.getItem("myRole");
  if (ROLES.includes(stored)) return stored;

  document.body.innerHTML =
    "<div style='font-family: system-ui; padding: 3rem; color:#3d332b;'>" +
    "Open this page once with <code>?me=santi</code> or <code>?me=kristina</code> " +
    "on the end of the URL — it remembers after that.</div>";
  throw new Error("No role set for this browser yet.");
}

export const ME = resolveRole();
export const THEM = ROLES.find((r) => r !== ME);
