// Pure category and stats logic: keys, colours, and totals over the log.

// Warm hues that sit on the cream surface without any reading as an error
// state. Assigned automatically on a category's first use and never changed,
// so there is no colour-picking step.
export const CATEGORY_PALETTE = [
  "#c1714a", "#7a9a6e", "#6b8ca8", "#b08968",
  "#9a7aa0", "#c9a227", "#8a8f7d", "#a8676a",
];
export const OTHER_COLOR = "#ded0bd";      // uncategorized, and "everything else"
export const UNCATEGORIZED_KEY = "uncategorized";

// "Thesis", "thesis " and "THESIS" must land on one key, or free text
// quietly fragments into three categories that are really one.
export function normalizeKey(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// The first palette colour nobody is using yet; after all eight are taken,
// cycles.
export function pickColor(catMap) {
  const used = new Set(Object.values(catMap).map((c) => c.color));
  const free = CATEGORY_PALETTE.find((c) => !used.has(c));
  return free || CATEGORY_PALETTE[Object.keys(catMap).length % CATEGORY_PALETTE.length];
}

// Today / this week / all time, in seconds.
export function totals(sessions, { startOfToday, startOfWeek }) {
  let today = 0, week = 0, all = 0;
  for (const s of sessions) {
    all += s.elapsedSeconds;
    if (s.endedAt >= startOfWeek) week += s.elapsedSeconds;
    if (s.endedAt >= startOfToday) today += s.elapsedSeconds;
  }
  return { today, week, all };
}

// Per-category totals since `from`, ranked, with everything past the top
// three collapsed into one remainder. The remainder exists so the
// proportion bar always sums to the real total: a top three on its own
// would render a week spread over six categories as though those three
// were the whole week.
export function breakdown(sessions, from, topN = 3) {
  const byKey = {};
  let grand = 0;
  for (const s of sessions) {
    if (s.endedAt < from) continue;
    const key = s.categoryKey || UNCATEGORIZED_KEY;
    byKey[key] = (byKey[key] || 0) + s.elapsedSeconds;
    grand += s.elapsedSeconds;
  }
  const ranked = Object.keys(byKey).sort((a, b) => byKey[b] - byKey[a]);
  const top = ranked.slice(0, topN).map((key) => ({ key, seconds: byKey[key] }));
  const rest = ranked.slice(topN);
  const restSeconds = rest.reduce((n, k) => n + byKey[k], 0);
  return { grand, top, restCount: rest.length, restSeconds };
}

// ---- Today's split, shared with the other person ----
// Each person publishes a summary of their own day into room/<me>/today, and
// the other person's breakdown widget can flip to it. A summary rather than
// read access to sessions/ and categories/: history stays private, the rules
// don't change, the peer downloads a few hundred bytes instead of a whole
// log, and "today" is the owner's own calendar day whatever their timezone.

// The published shape. Labels and colours are resolved here, by the owner,
// so the reader never needs the owner's vocabulary. `until` is the owner's
// next local midnight: past it, the summary describes a day that is over.
export function shareableToday(b, labelFor, colorFor, until) {
  return {
    until,
    seconds: b.grand,
    top: b.top.map(({ key, seconds }) => ({ label: labelFor(key), color: colorFor(key), seconds })),
    restCount: b.restCount,
    restSeconds: b.restSeconds,
  };
}

const num = (v) => (typeof v === "number" && isFinite(v) && v > 0 ? v : 0);

// The reader's side: null for "nothing logged today", which covers a
// missing summary, yesterday's summary, and anything malformed. Shaped like
// breakdown()'s result, but with labels and colours instead of keys.
// Firebase may hand an array back as an object with numeric keys, hence
// Object.values.
export function readSharedToday(raw, now) {
  if (!raw || typeof raw !== "object" || !(num(raw.until) > now)) return null;
  const top = Object.values(raw.top || {})
    .filter((r) => r && typeof r.label === "string" && num(r.seconds))
    .slice(0, 3)
    .map((r) => ({ label: r.label, color: typeof r.color === "string" ? r.color : OTHER_COLOR, seconds: num(r.seconds) }));
  const grand = num(raw.seconds);
  if (!grand) return null;
  return { grand, top, restCount: num(raw.restCount), restSeconds: num(raw.restSeconds) };
}
