// Pure time-of-day logic for the Koi pond wallpaper: given an hour, how the
// light falls on the water. No DOM — js/sky.js applies it; the unit tests
// check it directly.
//
// The whole pond is lit by ONE colour, multiplied over everything (water,
// pads and fish alike). White at midday changes nothing; pink at dawn,
// gold in the afternoon, lavender at dusk and indigo at night recolour the
// scene the way real light does. Chosen over a separate palette per layer
// (as Paper hills does): one tint keeps every layer in the same light by
// construction, and the pond has five layers of paper plus four fish that
// would otherwise each need their own keyframes.
//
// The sun and moon aren't drawn — the view is straight down — but their
// reflections are: a soft glint that crosses the water on the same arc and
// schedule as Paper hills' sky, so the two wallpapers agree on the time.

import { skyAt, mix } from "./sky.js";

// hour, light colour. Night is a lifted indigo rather than near-black, so
// the koi stay visible as dim shapes instead of vanishing. Dusk is
// lavender, not rose: multiplied over teal water, rose (nearly teal's
// complement) cancels to grey, while lavender deepens it towards violet.
// The warmth at dusk comes from the low orange sun's reflection instead.
const KEYS = [
  [0,     "#56628f"],
  [5.5,   "#6e6c97"],
  [6.5,   "#f3c3b8"],
  [8,     "#fff1e0"],
  [13,    "#ffffff"],
  [17,    "#ffe5c2"],
  [18.75, "#b8a6d6"],
  [20,    "#76719c"],
  [22,    "#56628f"],
  [24,    "#56628f"],
];

export function pondAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (KEYS[i + 1][0] <= h) i++;
  const [h0, c0] = KEYS[i];
  const [h1, c1] = KEYS[i + 1];
  const light = mix(c0, c1, (h - h0) / (h1 - h0));

  const sky = skyAt(h);
  return {
    light,
    sun: { visible: sky.sun.visible, x: sky.sun.x, y: sky.sun.y, color: sky.sun.color },
    moon: { visible: sky.moon.visible, x: sky.moon.x, y: sky.moon.y },
  };
}
