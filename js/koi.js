// The koi in the Koi pond wallpaper: builds the four fish (and their
// shadows) into #backgroundLayer once at startup. All their motion is CSS
// in css/wallpapers/koi.css; this file only draws them and says where each
// one swims.
//
// Built here rather than written out in index.html because every fish
// appears twice (itself, and its blurred shadow on the bottom), each with
// its own pattern clipped to its body, and four fish × two copies of
// hand-written SVG would be most of index.html.
//
// HOW A FISH SWIMS, as nested elements, outside in:
//   .koi-swim   pinned at the fish's home point; slowly drifts that point
//               around a closed loop over a few minutes
//   .koi-orbit  a zero-size point that does nothing but rotate
//   .koi-place  offset sideways by --r and turned 90°, so rotating the
//               parent carries the fish round a circle, always facing the
//               way it's going
//   .koi-sway   a gentle side-to-side swing of the whole fish
//   .koi-tail   the tail, beating faster about its joint
// Nested transforms compose, which is what lets four simple motions add up
// to one fish that loops, wanders and swims at once. Same trick as the
// swirl's orbits (css/background.css).
//
// Rejected: CSS motion paths (offset-path), which would let each fish follow
// a hand-drawn curve. They animate on the main thread in Chrome rather than
// the compositor, and the background rules allow only transform and opacity
// to animate on a page that is open for hours.
//
// The shadows get the drift and orbit but not the sway or tail beat. They
// are blurred enough that neither would show, and it halves their layers.

// Body in a 120×48 box, head pointing right. Patches are clipped to it.
const BODY = "M112,24 C112,15 98,9 76,9 C52,9 30,15 14,24 C30,33 52,39 76,39 C98,39 112,33 112,24 Z";
const FINS = "M88,12 C82,4 72,0 66,2 C70,8 76,12 82,14 Z M88,36 C82,44 72,48 66,46 C70,40 76,36 82,34 Z";
// Tail in a 30×48 box; the joint with the body is the middle of its right edge.
const TAIL = "M30,24 C22,18 10,6 2,4 C6,14 7,34 2,44 C10,42 22,30 30,24 Z";

// Four classic varieties. Each patch is [colour, cx, cy, rx, ry] in body
// coordinates. Home point (x vw, y vh), circle radius r (vmin), lap time,
// which way round, drift loop, length (vmin).
//
// Homes sit in the left and right thirds, so the fish pass under the timer
// card now and then rather than living beneath it.
const FISH = [
  { name: "kohaku", base: "#f7f1e6", fin: "#fbf6ee",
    patches: [["#e0512e", 94, 22, 13, 9], ["#e0512e", 62, 26, 16, 11], ["#e0512e", 33, 21, 10, 6]],
    x: 20, y: 42, r: 17, lap: 95, cw: true, drift: "koi-drift-a", driftT: 210, len: 12, delay: -20 },
  { name: "ogon", base: "#eeae3c", fin: "#f6cb73",
    patches: [["#f8d47e", 98, 24, 13, 10], ["#f3bf55", 50, 24, 22, 8]],
    x: 78, y: 58, r: 18, lap: 120, cw: false, drift: "koi-drift-b", driftT: 260, len: 11, delay: -70 },
  { name: "showa", base: "#2d2b30", fin: "#4a474d",
    patches: [["#d9482b", 95, 24, 12, 10], ["#d9482b", 57, 19, 14, 8], ["#f3ece0", 70, 31, 12, 6], ["#f3ece0", 30, 26, 9, 6]],
    x: 72, y: 26, r: 13, lap: 82, cw: true, drift: "koi-drift-c", driftT: 190, len: 10.5, delay: -40 },
  { name: "orenji", base: "#ee7a2e", fin: "#f4a061",
    patches: [["#f6a25c", 97, 24, 11, 9]],
    x: 26, y: 76, r: 12, lap: 72, cw: false, drift: "koi-drift-d", driftT: 230, len: 9.5, delay: -5 },
];

const SVG = 'xmlns="http://www.w3.org/2000/svg"';

function fishSvg(f) {
  const clip = "koi-clip-" + f.name;
  const patches = f.patches
    .map(([c, cx, cy, rx, ry]) => `<ellipse fill="${c}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`)
    .join("");
  return `<svg class="koi-body" ${SVG} viewBox="0 0 120 48">
    <defs><clipPath id="${clip}"><path d="${BODY}"/></clipPath></defs>
    <path class="koi-fins" fill="${f.fin}" d="${FINS}"/>
    <path class="koi-skin" fill="${f.base}" d="${BODY}"/>
    <g clip-path="url(#${clip})">${patches}</g>
    <path class="koi-edge" d="${BODY}"/>
    <circle class="koi-eye" cx="104" cy="18.5" r="1.6"/><circle class="koi-eye" cx="104" cy="29.5" r="1.6"/>
  </svg>`;
}

function tailSvg(f) {
  return `<svg ${SVG} viewBox="0 0 30 48"><path fill="${f.fin}" d="${TAIL}"/></svg>`;
}

// The shadow is the whole silhouette, tail included, blurred inside its own
// SVG so it's rasterised once and then only moved.
function shadowSvg(f) {
  const blur = "koi-blur-" + f.name;
  return `<svg class="koi-shadow" ${SVG} viewBox="-30 -12 150 72">
    <defs><filter id="${blur}" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="3.5"/></filter></defs>
    <g filter="url(#${blur})"><path d="${BODY}"/><path d="${FINS}"/><path transform="translate(-14 0)" d="${TAIL}"/></g>
  </svg>`;
}

// One fish's travelling wrappers, holding `inner`. The fish and its shadow
// share these values exactly, so the shadow stays under its fish.
function swimmer(f, inner) {
  const swim = document.createElement("div");
  swim.className = "koi-swim koi-" + f.name;
  swim.style.cssText = [
    `--x:${f.x}vw`, `--y:${f.y}vh`, `--r:${f.r}vmin`, `--len:${f.len}vmin`,
    `--lap:${f.lap}s`, `--dir:${f.cw ? "normal" : "reverse"}`, `--turn:${f.cw ? 90 : -90}deg`,
    `--drift:${f.drift}`, `--drift-t:${f.driftT}s`, `--delay:${f.delay}s`,
  ].join(";");
  swim.innerHTML = `<div class="koi-orbit"><div class="koi-place">${inner}</div></div>`;
  return swim;
}

export function init() {
  const school = document.querySelector(".koi-school");
  const shadows = document.querySelector(".koi-shadows");
  if (!school || !shadows) return;
  for (const f of FISH) {
    shadows.append(swimmer(f, shadowSvg(f)));
    school.append(swimmer(f,
      `<div class="koi-sway"><div class="koi-tail">${tailSvg(f)}</div>${fishSvg(f)}</div>`));
  }
}
