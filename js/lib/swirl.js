// Pure sizing and motion for Swirl's small drawing surface. The soft colors
// do not need Retina resolution; the paper and grain remain full-size CSS.

export const MAX_SWIRL_EDGE = 960;
export const SWIRL_FRAME_MS = 1000 / 30;

// Bound the longest edge independently of devicePixelRatio. Matching the
// physical display pixels would bring back the cost on a large Retina Mac.
export function swirlSize(width, height) {
  const scale = Math.min(1, MAX_SWIRL_EDGE / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// CSS ease-in-out is cubic-bezier(.42, 0, .58, 1). Solve its x coordinate
// before reading y; smoothstep alone would change the familiar drift.
export function easeInOut(progress) {
  const p = Math.min(1, Math.max(0, progress));
  let lo = 0, hi = 1;
  for (let i = 0; i < 16; i++) {
    const t = (lo + hi) / 2;
    const x = 3 * (1 - t) ** 2 * t * 0.42 + 3 * (1 - t) * t ** 2 * 0.58 + t ** 3;
    if (x < p) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  return 3 * (1 - t) * t ** 2 + t ** 3;
}

// Endpoints match the CSS fallback's four wobble animations, in vmax.
const WOBBLES = {
  "wob-a": [8, 6, 1, 1.14],
  "wob-b": [-9, 7, 1.10, 1],
  "wob-c": [7, -8, 1, 1.12],
  "wob-d": [-6, -6, 1.08, 1],
};

// Nested CSS transforms expressed as one position and size. Travel stays
// a continuous orbit; only the local wobble reverses at each endpoint.
export function swirlPose(blob, elapsedMs, vmax) {
  const cycle = elapsedMs / blob.wobbleMs;
  const step = cycle % 2;
  const t = easeInOut(step <= 1 ? step : 2 - step);
  const [dx, dy, fromScale, toScale] = WOBBLES[blob.wobble];
  const angle = (elapsedMs - blob.delayMs) / blob.orbitMs * Math.PI * 2;
  const x = blob.radius + dx * vmax / 100 * t;
  const y = dy * vmax / 100 * t;
  return {
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle),
    size: blob.diameter * (fromScale + (toScale - fromScale) * t),
  };
}
