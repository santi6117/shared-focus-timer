// Pure time-of-day logic for the Paper hills wallpaper: given an hour of
// the day, what colour is the sky, the hills and the light, and where are
// the sun and the moon. No DOM — js/sky.js applies it; the unit tests
// check it directly.
//
// The day is a list of keyframes, and any moment between two of them is a
// straight blend of the two. Chosen over four fixed scenes (dawn, day,
// dusk, night) swapped on the hour: the point of a live sky is that it
// moves while you work, and a scene change is a jump you'd notice.
//
// The schedule is fixed (sunrise around 6:30, sunset around 18:45) rather
// than computed from date and latitude: the page doesn't know where anyone
// is, and asking for location to colour a wallpaper isn't worth it.

// hour, sky top, sky bottom (the horizon), four hill layers far → near,
// star visibility 0–1.
const KEYS = [
  [0,     "#141a33", "#2c3358", ["#2e3554", "#262c47", "#1f243b", "#181c2f"], 1],
  [5.5,   "#252a4f", "#5f5478", ["#4a4766", "#3c3a58", "#312f4a", "#26253b"], 0.7],
  [6.5,   "#8592c2", "#f4b39e", ["#b89aa6", "#9c8199", "#7e6a86", "#615470"], 0.1],
  [8,     "#9cc6e6", "#fbe2c2", ["#b6cba0", "#98b68a", "#7c9f74", "#61865e"], 0],
  [13,    "#86bde8", "#e6efe4", ["#bcd39c", "#9cbf84", "#7fa76d", "#638c58"], 0],
  [17,    "#e9b583", "#fde0ae", ["#cdb97c", "#ad9d68", "#8e8257", "#716946"], 0],
  [18.75, "#6b5a96", "#f39a6a", ["#8f6c7d", "#735571", "#59405f", "#422f4b"], 0],
  [20,    "#2b2e5a", "#6a4f7a", ["#3d3859", "#322e4c", "#28253f", "#1f1d33"], 0.6],
  [22,    "#141a33", "#2c3358", ["#2e3554", "#262c47", "#1f243b", "#181c2f"], 1],
  [24,    "#141a33", "#2c3358", ["#2e3554", "#262c47", "#1f243b", "#181c2f"], 1],
];

export const SUNRISE = 6.5;
export const SUNSET = 18.75;

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
export function mix(a, b, t) {
  const A = toRgb(a), B = toRgb(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
}

// Where a body sits on an arc across the sky, from rising at progress 0 to
// setting at 1. x and y in percent of the screen; y=0 is the top.
function arc(progress) {
  return {
    x: 8 + 84 * progress,
    y: 70 - 52 * Math.sin(Math.PI * progress),
  };
}

export function skyAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (KEYS[i + 1][0] <= h) i++;
  const [h0, top0, bot0, hills0, stars0] = KEYS[i];
  const [h1, top1, bot1, hills1, stars1] = KEYS[i + 1];
  const t = (h - h0) / (h1 - h0);

  const sunUp = h >= SUNRISE && h <= SUNSET;
  const sunP = (h - SUNRISE) / (SUNSET - SUNRISE);
  // The moon crosses the night: up a little after sunset, down a little
  // before sunrise, across midnight.
  const MOONRISE = 19.5, MOONSET = 5.75;
  const nightLen = 24 - MOONRISE + MOONSET;
  const sinceMoonrise = (h - MOONRISE + 24) % 24;
  const moonUp = sinceMoonrise <= nightLen;

  // Near the horizon the sun is low, orange and large; high, it's pale.
  const sunHeight = sunUp ? Math.sin(Math.PI * sunP) : 0;

  const skyTop = mix(top0, top1, t), skyBottom = mix(bot0, bot1, t);
  const stars = stars0 + (stars1 - stars0) * t;
  return {
    skyTop,
    skyBottom,
    // Paper clouds catch the horizon's colour by day and go dim at night.
    cloud: mix(mix(skyBottom, "#ffffff", 0.6), mix(skyTop, "#ffffff", 0.14), stars),
    hills: hills0.map((c, k) => mix(c, hills1[k], t)),
    stars,
    sun: { visible: sunUp, ...arc(sunUp ? sunP : 0), color: mix("#ffa15e", "#fff3cf", Math.min(1, sunHeight * 1.6)) },
    moon: { visible: moonUp, ...arc(moonUp ? sinceMoonrise / nightLen : 0) },
  };
}
