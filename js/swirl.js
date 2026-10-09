// Swirl's color animation, flattened into one bounded canvas. Eight cached
// small gradient images move inside it instead of eight window-sized CSS
// layers. The original paper, grain, palette and motion stay in the CSS.
//
// Rejected: disabling the wallpaper or simplifying its colors. Soft blobs
// scale well from a smaller image, while the crisp paper is kept above it.
// CSS remains a fallback if this browser cannot supply a 2D canvas.

import { SWIRL_FRAME_MS, swirlSize, swirlPose } from "./lib/swirl.js";

export function init() {
  const layer = document.getElementById("backgroundLayer");
  const wrapper = layer.querySelector(".wp-swirl");
  const canvas = document.createElement("canvas");
  let ctx;
  try { ctx = canvas.getContext("2d", { alpha: false }); } catch (e) { return; }
  if (!ctx) return;
  canvas.className = "swirl-canvas";
  canvas.setAttribute("aria-hidden", "true");
  wrapper.prepend(canvas);

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const elements = [...wrapper.querySelectorAll(".blob")];
  let blobs = [];
  let width = 0, height = 0, base;
  let frame = null, lastPaint = -Infinity;
  // Navigation time, like CSS animations: a hidden tab does no work but
  // returns to the phase the colors would have reached, without catching up.
  const elapsed = () => reduced.matches ? 0 : performance.now();

  // CSS owns the palette, diameters, radii and timing knobs. Read them on
  // resize, not per frame, so tuning the existing CSS still tunes Swirl.
  function resize() {
    ({ width, height } = layer.getBoundingClientRect());
    const size = swirlSize(width, height);
    canvas.width = size.width;
    canvas.height = size.height;
    base = getComputedStyle(layer).backgroundColor;
    blobs = elements.map((el) => {
      const style = getComputedStyle(el);
      const orbit = getComputedStyle(el.parentElement);
      return {
        radius: parseFloat(style.left),
        diameter: parseFloat(style.width),
        wobble: style.animationName,
        wobbleMs: parseFloat(style.animationDuration) * 1000,
        orbitMs: parseFloat(orbit.animationDuration) * 1000,
        delayMs: parseFloat(orbit.animationDelay) * 1000,
        image: gradient(style.getPropertyValue("--swirl-color").trim()),
      };
    });
    // Reduced motion removes CSS animation names and durations. The still
    // image is the fallback's untransformed arrangement, not an orbit frame.
    if (active()) paint();
    wrapper.classList.add("swirl-ready");
    lastPaint = -Infinity;
  }

  function active() {
    return layer.dataset.bg === "swirl" && document.visibilityState !== "hidden";
  }

  // One opaque surface bounds the moving pixels. Cached images avoid
  // rebuilding/rasterizing a radial gradient on every animation frame.
  function paint() {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(canvas.width / width, canvas.height / height);
    const time = elapsed();
    for (const blob of blobs) {
      const pose = reduced.matches
        ? { x: blob.radius, y: 0, size: blob.diameter }
        : swirlPose(blob, time, Math.max(width, height));
      ctx.drawImage(blob.image, width / 2 + pose.x - pose.size / 2,
        height / 2 + pose.y - pose.size / 2, pose.size, pose.size);
    }
    ctx.restore();
  }

  function animate(now) {
    frame = null;
    if (!active() || reduced.matches) return;
    if (now - lastPaint >= SWIRL_FRAME_MS - 0.5) {
      paint();
      lastPaint = now;
    }
    frame = requestAnimationFrame(animate);
  }

  // Cancel the loop completely when hidden, unselected, or reduced-motion.
  // Merely hiding a canvas does not stop JavaScript drawing into it.
  function sync() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    if (!active()) return;
    paint();
    lastPaint = performance.now();
    if (!reduced.matches) frame = requestAnimationFrame(animate);
  }

  resize();
  new ResizeObserver(resize).observe(layer);
  new MutationObserver(sync).observe(layer, { attributes: true, attributeFilter: ["data-bg"] });
  document.addEventListener("visibilitychange", sync);
  // Re-read motion styles when the OS setting changes, too.
  reduced.addEventListener("change", () => { resize(); sync(); });
  sync();
}

// Small reusable sprite; all eight are rasterized once per resize. The
// radial-gradient's farthest-corner radius is sqrt(2)/2 of its square,
// so the 30% / 68% stops match the CSS instead of sharpening the edges.
function gradient(color) {
  const image = document.createElement("canvas");
  image.width = image.height = 256;
  const ctx = image.getContext("2d");
  const radius = image.width * Math.SQRT1_2;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, radius);
  g.addColorStop(0, color);
  g.addColorStop(0.30, color + "cc");
  g.addColorStop(0.68, color + "00");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return image;
}
