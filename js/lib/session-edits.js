// Session edit snapshots and exact IANA-local date conversion. Original timer
// records remain intact; an active snapshot supplies the corrected view.

export function readSession(id, raw) {
  if (!raw || typeof raw !== "object") return null;
  const active = raw.activeEdit || 0;
  const value = active ? raw.timeEdits?.[active] : raw;
  if (!value || !Number.isFinite(value.endedAt) || !Number.isInteger(value.elapsedSeconds)
      || value.elapsedSeconds < 0) return null;
  return {
    id, endedAt: value.endedAt, elapsedSeconds: value.elapsedSeconds,
    categoryKey: value.categoryKey || value.category || "uncategorized",
    timeZone: typeof value.timeZone === "string" ? value.timeZone : null,
    activityVersion: raw.activityVersion,
    removed: value.removed === true,
    source: raw.source === "manual" ? "manual" : "timer",
    editVersion: raw.editVersion || 0,
    canUndo: active > 0,
  };
}

export function dateTimeInZone(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(timestamp);
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

// Try the zone offsets around the date, then verify the wall time exactly.
// Silently normalizing a spring gap or choosing a fall-back occurrence would
// put manually entered work at a time the user didn't choose.
export function parseLocalTime(text, timeZone) {
  if (!/^20\d\d-\d\d-\d\dT\d\d:\d\d(:\d\d)?$/.test(text)) throw new Error("Enter a date and time between 2000 and 2099.");
  const target = text.length === 16 ? text + ":00" : text;
  const naive = Date.parse(target + "Z");
  if (!Number.isFinite(naive)) throw new Error("Enter a valid date and time.");
  // Formatting also validates the IANA timezone before any data is written.
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = naive + hours * 3600_000;
    offsets.add(Date.parse(dateTimeInZone(sample, timeZone) + "Z") - sample);
  }
  const matches = [...offsets].map((offset) => naive - offset)
    .filter((timestamp) => dateTimeInZone(timestamp, timeZone) === target);
  if (!matches.length) throw new Error("That local time does not exist. Check the date and daylight-saving change.");
  if (matches.length > 1) throw new Error("That local time occurs twice during daylight saving. Choose a different end time.");
  return matches[0];
}

export function validateWork({ dateTime, timeZone, minutes, categoryKey }, now) {
  let endedAt;
  try { endedAt = parseLocalTime(dateTime, timeZone); }
  catch (error) {
    if (error instanceof RangeError) throw new Error("Enter a valid timezone, such as Europe/London.");
    throw error;
  }
  const elapsedSeconds = Math.round(Number(minutes) * 60);
  if (!Number.isFinite(Number(minutes)) || !Number.isInteger(elapsedSeconds)
      || elapsedSeconds < 1 || elapsedSeconds > 86400) throw new Error("Enter between 1 second and 24 hours of work.");
  if (endedAt > now) throw new Error("The end time must be in the past.");
  if (endedAt - elapsedSeconds * 1000 < Date.UTC(2000, 0, 1)) throw new Error("Work must start on or after 1 January 2000.");
  if (typeof categoryKey !== "string" || !categoryKey) throw new Error("Choose a category.");
  return { endedAt, elapsedSeconds, timeZone, categoryKey, removed: false };
}

// Each edit appends a snapshot. Undo moves the active pointer back while
// retaining the snapshots and a monotonic version for conflict detection.
export function reviseSession(raw, expectedVersion, change, timestamp) {
  if (!raw || (raw.editVersion || 0) !== expectedVersion) throw new Error("This session changed on another device. Reopen it before saving.");
  const next = { ...raw, editVersion: expectedVersion + 1 };
  if (change === "undo") {
    const active = raw.timeEdits?.[raw.activeEdit];
    if (!active) throw new Error("There is no earlier change to undo.");
    next.activeEdit = active.previousEdit || 0;
  } else {
    next.timeEdits = { ...raw.timeEdits, [next.editVersion]: {
      ...change, previousEdit: raw.activeEdit || 0, changedAt: timestamp,
    } };
    next.activeEdit = next.editVersion;
  }
  return next;
}
