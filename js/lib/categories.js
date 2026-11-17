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

// A private Progress assignment takes precedence over the text category.
// Separate key spaces keep a standalone label and a same-named column distinct.
export function breakdown(sessions, from, targetFor) {
  const byKey = new Map();
  let grand = 0;
  for (const s of sessions) {
    if (s.endedAt < from || s.removed || !s.elapsedSeconds) continue;
    const target = targetFor(s);
    const columnId = target?.columnId;
    const categoryKey = columnId ? undefined : s.categoryKey || UNCATEGORIZED_KEY;
    const key = columnId ? "column:" + columnId : "category:" + categoryKey;
    const group = byKey.get(key) || { key, categoryKey, columnId, seconds: 0, tasks: new Map() };
    group.seconds += s.elapsedSeconds;
    if (columnId) {
      const taskId = target.taskId || null;
      group.tasks.set(taskId, (group.tasks.get(taskId) || 0) + s.elapsedSeconds);
    }
    byKey.set(key, group);
    grand += s.elapsedSeconds;
  }
  return { grand, ranked: [...byKey.values()].sort((a, b) => b.seconds - a.seconds || a.key.localeCompare(b.key)) };
}
