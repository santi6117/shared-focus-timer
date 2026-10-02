// Pure helpers for the status: what you're up to when you're not focusing.
// No DOM, no Firebase — imported by status.js and presence.js, and by the
// unit tests.

export const STATUS_MAX = 40;

// Trimmed, inner whitespace collapsed, capped. An empty result means
// "clear the status".
export function normalizeStatus(text) {
  return String(text || "").trim().replace(/\s+/g, " ").slice(0, STATUS_MAX);
}

// "just now" / "40m ago" / "3h ago" / "2d ago". Coarse on purpose: the
// point is telling a fresh status from a stale one, and "sleeping · 14h
// ago" says that without anyone having to clear it.
export function formatAgo(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return hours + "h ago";
  return Math.floor(hours / 24) + "d ago";
}

// The presence pill's text when the other person isn't running a timer.
// `status` is room/<them>/status: { text, setAt } or null.
export function idleText(status, serverNow) {
  if (!status || !status.text) return "not working";
  if (typeof status.setAt !== "number") return status.text;
  return status.text + " · " + formatAgo(serverNow - status.setAt);
}
