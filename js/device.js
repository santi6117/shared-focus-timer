// Which kind of device this is: a LAPTOP, which runs the timer, or a PHONE,
// which is a remote.
//
// Timers live only on laptops, on purpose: starting one from a phone would
// mean picking up the phone to focus, which defeats the point. So a phone
// shows your laptop's timer read-only, lets you set a status, and shows the
// other person. It never writes `running`, and it never registers the
// "mark me not working when I disconnect" instruction — an iPhone drops its
// connection every time the screen locks, and that instruction would flip
// you to "not working" while your laptop was still mid-session.
//
// Detected from the input hardware rather than screen width: a touch-only
// device with no hover is a phone or tablet, while a narrow laptop window
// is still a laptop. ?device=phone or ?device=laptop overrides the guess
// and is remembered, for the rare device that gets it wrong (and for tests).
//
// Resolved once, when the module first loads. Sets `remote` on <html> so
// the CSS can hide the timer controls.

const MODES = ["phone", "laptop"];

function resolveMode() {
  const fromUrl = new URLSearchParams(window.location.search).get("device");
  if (MODES.includes(fromUrl)) {
    localStorage.setItem("deviceMode", fromUrl);
    return fromUrl;
  }
  const stored = localStorage.getItem("deviceMode");
  if (MODES.includes(stored)) return stored;
  const touchOnly = window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;
  return touchOnly ? "phone" : "laptop";
}

export const REMOTE = resolveMode() === "phone";
document.documentElement.classList.toggle("remote", REMOTE);
