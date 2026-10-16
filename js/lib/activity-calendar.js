// Pure date helpers and validation for the shared activity calendar.
// Daily summaries are intentionally smaller than the private session log.

export function localDayKey(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return values.year + "-" + values.month + "-" + values.day;
}

export function monthKey(timestamp, timeZone) {
  return localDayKey(timestamp, timeZone).slice(0, 7);
}

export function monthCells(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new Error("Invalid calendar month");
  const year = Number(match[1]), month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("Invalid calendar month");
  const first = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((mondayOffset + count) / 7) * 7 }, () => null);
  for (let day = 1; day <= count; day++) {
    const date = year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    cells[mondayOffset + day - 1] = date;
  }
  return cells;
}

// Missing means unknown, not zero. Only an explicit valid daily summary can
// show a zero total or contribute to the calendar's monthly sums.
export function readDailySummary(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return null;
  if (!Number.isInteger(value.totalSeconds) || value.totalSeconds < 0) return null;
  if (typeof value.timeZone !== "string" || !value.timeZone) return null;
  if (!Number.isInteger(value.sessionCount) || value.sessionCount < 0) return null;
  if (!Number.isFinite(value.updatedAt)) return null;
  return {
    date: value.date,
    totalSeconds: value.totalSeconds,
    sessionCount: value.sessionCount,
    timeZone: value.timeZone,
    updatedAt: value.updatedAt,
    coverage: value.coverage === "backfilled" ? "backfilled" : "new-sessions",
  };
}

export function monthTotal(summaries, key) {
  const prefix = key + "-";
  return Object.entries(summaries || {}).reduce((sum, [date, raw]) => {
    if (!date.startsWith(prefix)) return sum;
    const summary = readDailySummary(raw);
    return sum + (summary && summary.date === date ? summary.totalSeconds : 0);
  }, 0);
}

export function monthCoveredDays(summaries, key) {
  const prefix = key + "-";
  return Object.entries(summaries || {}).filter(([date, raw]) => {
    const summary = readDailySummary(raw);
    return date.startsWith(prefix) && summary && summary.date === date;
  }).length;
}

