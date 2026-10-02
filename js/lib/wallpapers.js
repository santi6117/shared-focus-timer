// Pure wallpaper logic: the catalogue, what's unlocked, and which one to
// show. No DOM, no storage — imported by wallpapers.js and the unit tests.
//
// Unlocks are derived from all-time focus hours, which the session log
// already holds. There is no "unlocked" flag stored anywhere: hours never go
// down, so a wallpaper unlocked once stays unlocked, and the log is the one
// source of truth.

// In unlock order. `built: false` marks one that's planned but not drawn
// yet; it shows in the picker so there's something to work towards, but
// can't be selected or previewed.
export const WALLPAPERS = [
  { id: "swirl", name: "Swirl",          hours: 0,   built: true },
  { id: "rain",  name: "Rainy window",   hours: 100, built: true },
  { id: "hills", name: "Paper hills",    hours: 200, built: false },
  { id: "koi",   name: "Koi pond",       hours: 300, built: false },
];
export const DEFAULT_WALLPAPER = "swirl";

const byId = (id) => WALLPAPERS.find((w) => w.id === id);

export function isUnlocked(id, totalSeconds) {
  const w = byId(id);
  return !!w && totalSeconds >= w.hours * 3600;
}

// Ids unlocked at this many seconds, in catalogue order.
export function unlockedIds(totalSeconds) {
  return WALLPAPERS.filter((w) => isUnlocked(w.id, totalSeconds)).map((w) => w.id);
}

// "62 / 100 h" for a locked one. Floors, so it never claims an hour early.
export function progressLabel(id, totalSeconds) {
  const w = byId(id);
  return Math.floor(totalSeconds / 3600) + " / " + w.hours + " h";
}

// Which wallpaper to draw. A preview (?bg=) wins if it names a built one,
// whatever the hours: it exists for trying them out. Otherwise the stored
// choice, trusted without re-checking hours (it was unlocked when chosen,
// and hours never decrease), so the right wallpaper paints on the first
// frame instead of waiting for the session log to load.
export function resolveWallpaper(stored, preview) {
  if (preview && byId(preview)?.built) return preview;
  if (stored && byId(stored)?.built) return stored;
  return DEFAULT_WALLPAPER;
}

// Unlocked, built and not yet seen: what earns the dot on the stats chip.
export function newlyUnlocked(totalSeconds, seenIds) {
  return unlockedIds(totalSeconds).filter(
    (id) => id !== DEFAULT_WALLPAPER && byId(id).built && !seenIds.includes(id)
  );
}
