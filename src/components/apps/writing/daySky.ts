/**
 * A post's day: a little world in the plate's style (dithered sky, three
 * ranges of pixel hills, pines, somebody's windows, seeded by the slug)
 * under a sky that runs from first light to night. The reader moves
 * through it: the first line is dawn, halfway is the high sun, the last
 * line is night, its stars out one by one and the windows lit.
 *
 * `buildDay` lays the world out once per size; `renderDay` relights it for
 * an hour. Every colour is an interpolation between a few keyframes and
 * the Bayer dither keeps it pixel, so scrolling can drive it cheaply.
 */

import { bayer } from "./plate";

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** the reading day: the first line at 06:00, the last at 22:00 */
export const DAY_START = 6;
export const DAY_END = 22;
const SUNRISE = 6.4;
const SUNSET = 20.6;
export const hourAt = (p: number) => lerp(DAY_START, DAY_END, clamp01(p));

type Key = { h: number; sky: RGB[]; far: RGB; mid: RGB; near: RGB; rim: RGB; glow: RGB; stars: number; clouds: number; lights: number };
const key = (h: number, sky: string[], far: string, mid: string, near: string, rim: string, glow: string, stars: number, clouds: number, lights: number): Key => ({
  h,
  sky: sky.map(hex),
  far: hex(far),
  mid: hex(mid),
  near: hex(near),
  rim: hex(rim),
  glow: hex(glow),
  stars,
  clouds,
  lights,
});

/* the plate's four phases (night, dawn, day, dusk) with the hours between them */
const KEYS: Key[] = [
  key(5.5, ["#05080a", "#0c1517", "#1c2a2a", "#3a3f3c"], "#1f2d2b", "#111b19", "#060a09", "#3d4f49", "#2e3a37", 0.75, 0, 1),
  key(6.75, ["#0a1213", "#20302f", "#5e6a62", "#d6b48c"], "#4a5650", "#26332e", "#0b130f", "#b39a80", "#9a8a6e", 0.08, 0.22, 0.45),
  key(9, ["#12222a", "#2a4249", "#5a7678", "#bcc3b2"], "#43605a", "#233f30", "#0b1a11", "#94a59c", "#7d8f84", 0, 0.4, 0),
  key(13, ["#16252a", "#2b4249", "#557379", "#a9bdb9"], "#3e5c58", "#22402f", "#0b1a11", "#86a1a2", "#6f8f8a", 0, 0.42, 0),
  key(17.5, ["#152229", "#2c3f45", "#647170", "#c9b593"], "#45564f", "#23392c", "#0b170f", "#a89a82", "#8f8670", 0, 0.36, 0),
  key(19.75, ["#07090c", "#1b2228", "#4b4a4f", "#c98762"], "#3b3a3c", "#1d2425", "#070c0a", "#a36f5c", "#7c5a4e", 0.12, 0.18, 0.5),
  key(20.9, ["#05070a", "#0d1418", "#1d2a2c", "#3b4542"], "#26302e", "#141c1b", "#060a09", "#4f5d56", "#33403c", 0.55, 0, 0.9),
  key(22, ["#040607", "#0a1314", "#152626", "#1f3533"], "#1d2e2c", "#111d1b", "#060a09", "#3f5a50", "#2c4440", 1, 0, 1),
];

function keyAt(h: number): Key {
  if (h <= KEYS[0].h) return KEYS[0];
  const last = KEYS[KEYS.length - 1];
  if (h >= last.h) return last;
  let i = 0;
  while (KEYS[i + 1].h < h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = (h - a.h) / (b.h - a.h);
  // eased, so each phase lingers before it turns
  const e = t * t * (3 - 2 * t);
  return {
    h,
    sky: a.sky.map((c, k) => mixRGB(c, b.sky[k], e)),
    far: mixRGB(a.far, b.far, e),
    mid: mixRGB(a.mid, b.mid, e),
    near: mixRGB(a.near, b.near, e),
    rim: mixRGB(a.rim, b.rim, e),
    glow: mixRGB(a.glow, b.glow, e),
    stars: lerp(a.stars, b.stars, e),
    clouds: lerp(a.clouds, b.clouds, e),
    lights: lerp(a.lights, b.lights, e),
  };
}

const STAR_INKS = ["#ebe9e1", "#ebe9e1", "#bcc2ba", "#89b4a8", "#aea3c8"].map(hex);
const EMBER = hex("#e0bd6e");
const EMBER_SOFT = hex("#ffe2b8");
const CLOUD = hex("#e3ebe7");
const SUN_LOW = hex("#f0a866");
const SUN_HIGH = hex("#f3dca0");
const MOON = hex("#e9e6d8");

function seed32(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** smooth 1D value noise, two octaves, 0..1 */
function ridge(rng: () => number, width: number, period: number) {
  const n = Math.ceil(width / period) + 3;
  const a = Array.from({ length: n }, rng);
  const b = Array.from({ length: n * 3 }, rng);
  const at = (pts: number[], x: number, p: number) => {
    const i = Math.floor(x / p);
    const f = x / p - i;
    const s = f * f * (3 - 2 * f);
    return pts[i] * (1 - s) + pts[i + 1] * s;
  };
  return (x: number) => at(a, x, period) * 0.72 + at(b, x, period / 3) * 0.28;
}

export type DayWorld = {
  W: number;
  H: number;
  horizon: number;
  /** ridge tops per range (far, mid, near), one per column */
  tops: [Int16Array, Int16Array, Int16Array];
  pines: { x: number; h: number }[];
  windows: { x: number; y: number; th: number }[];
  stars: { x: number; y: number; ink: RGB; a: number; th: number; cross: boolean }[];
  clouds: { x: number; y: number; w: number }[];
  /** sun and moon radius, in cells */
  r: number;
};

/** Lay out a post's world for a W×H-cell frame. */
export function buildDay(slug: string, W: number, H: number): DayWorld {
  const rng = mulberry32(seed32(`day:${slug}`));
  // a short band (phones) keeps more sky; a window keeps the plate's proportions
  const band = W / H > 3.2;
  const horizon = Math.round(H * (band ? 0.58 : 0.6) + rng() * H * 0.05);
  const amp = (k: number, min: number) => Math.max(min, H * k);
  // periods in cells, not in widths: a wide band gets more hills, not wider ones
  const specs = [
    { base: horizon + Math.round(H * 0.06), amp: amp(0.3, 4), period: 18 + rng() * 14 },
    { base: horizon + Math.round(H * 0.16), amp: amp(0.16, 3), period: 12 + rng() * 8 },
    { base: horizon + Math.round(H * 0.28), amp: amp(0.11, 2), period: 9 + rng() * 6 },
  ];
  const tops = specs.map((s) => {
    const n = ridge(rng, W, s.period);
    const top = new Int16Array(W);
    // stretched around its middle so the ranges read as hills, not as a line
    for (let x = 0; x < W; x++) top[x] = Math.round(s.base - Math.min(1, Math.max(0, (n(x) - 0.5) * 1.6 + 0.5)) * s.amp);
    return top;
  }) as [Int16Array, Int16Array, Int16Array];

  const pines: DayWorld["pines"] = [];
  const nPines = Math.max(2, Math.floor(W / 18));
  for (let k = 0; k < nPines; k++) pines.push({ x: Math.floor(rng() * W), h: Math.max(2, Math.round(H * (0.05 + rng() * 0.05))) });

  const windows: DayWorld["windows"] = [];
  const nWin = W > 90 ? 3 : 2;
  for (let k = 0; k < nWin; k++) {
    for (let tries = 0; tries < 8; tries++) {
      const x = Math.floor(W * (0.3 + rng() * 0.62));
      const y = tops[1][x] + 1 + Math.floor(rng() * 2);
      // only where the middle ridge shows above the near one
      if (x + 1 >= W || y > Math.min(tops[2][x], tops[2][x + 1]) - 2) continue;
      if (windows.some((w) => Math.abs(w.x - x) < 4)) continue;
      windows.push({ x, y, th: (k + 0.5) / nWin });
      break;
    }
  }

  const stars: DayWorld["stars"] = [];
  const nStars = Math.round((W * horizon) / 40);
  for (let s = 0; s < nStars; s++) {
    stars.push({
      x: Math.floor(rng() * W),
      y: Math.floor(Math.pow(rng(), 1.4) * horizon * 0.85),
      ink: STAR_INKS[Math.floor(rng() * STAR_INKS.length)],
      a: 0.45 + rng() * 0.55,
      th: rng(),
      cross: rng() > 0.94,
    });
  }

  const clouds: DayWorld["clouds"] = [];
  const nClouds = 2 + Math.floor(rng() * 3);
  for (let c = 0; c < nClouds; c++) clouds.push({ x: Math.floor(rng() * W), y: Math.floor(horizon * (0.12 + rng() * 0.5)), w: Math.max(6, Math.round(W * (0.08 + rng() * 0.14))) });

  return { W, H, horizon, tops, pines, windows, stars, clouds, r: Math.max(2, Math.round(Math.min(H * 0.085, W * 0.045))) };
}

/** Where the sun is at an hour, in cells (null below the horizon). */
function sunAt(D: DayWorld, h: number) {
  const s = (h - SUNRISE) / (SUNSET - SUNRISE);
  if (s < -0.04 || s > 1.04) return null;
  const e = Math.sin(Math.PI * clamp01(s));
  const top = Math.max(D.r + 2, D.H * 0.13);
  return { x: Math.round(lerp(0.08, 0.92, s) * D.W), y: Math.round(D.horizon + D.r - e * (D.horizon + D.r - top)), e };
}

/** Paint the world at an hour into `out` (W×H RGBA, opaque). */
export function renderDay(D: DayWorld, h: number, out: Uint8ClampedArray) {
  const { W, H, horizon, tops } = D;
  const K = keyAt(h);
  const put = (x: number, y: number, c: RGB, a = 1) => {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const i = (y * W + x) * 4;
    if (a >= 1) {
      out[i] = c[0];
      out[i + 1] = c[1];
      out[i + 2] = c[2];
    } else {
      out[i] += (c[0] - out[i]) * a;
      out[i + 1] += (c[1] - out[i + 1]) * a;
      out[i + 2] += (c[2] - out[i + 2]) * a;
    }
    out[i + 3] = 255;
  };

  // sky: dithered bands from the zenith to just below the horizon
  const skyEnd = horizon + 3;
  const n = K.sky.length - 1;
  for (let y = 0; y < H; y++) {
    const t = Math.min(1, y / skyEnd) * n;
    const i = Math.min(n - 1, Math.floor(t));
    const f = t - i;
    for (let x = 0; x < W; x++) put(x, y, f > bayer(x, y) ? K.sky[i + 1] : K.sky[i]);
  }

  const sun = sunAt(D, h);
  // the halo: dithered, wider and warmer when the sun is low
  if (sun) {
    const R = Math.max(8, Math.min(W, H * 1.6) * (0.5 - 0.12 * sun.e));
    const glow = mixRGB(K.glow, SUN_LOW, 0.25 * (1 - sun.e));
    for (let y = Math.max(0, Math.floor(sun.y - R)); y < Math.min(horizon + 2, sun.y + R); y++) {
      for (let x = Math.max(0, Math.floor(sun.x - R)); x < Math.min(W, sun.x + R); x++) {
        const r = Math.hypot(x - sun.x, (y - sun.y) * 1.08) / R;
        if (r >= 1) continue;
        if ((1 - r) * (1 - r) * 0.9 > bayer(x + 1, y + 2)) put(x, y, glow, 0.42);
      }
    }
  }

  // stars come out one by one as the dark deepens
  for (const s of D.stars) {
    if (K.stars <= s.th) continue;
    const a = s.a * Math.min(1, (K.stars - s.th) * 6);
    put(s.x, s.y, s.ink, a);
    if (s.cross) {
      put(s.x - 1, s.y, s.ink, a * 0.35);
      put(s.x + 1, s.y, s.ink, a * 0.35);
      put(s.x, s.y - 1, s.ink, a * 0.35);
      put(s.x, s.y + 1, s.ink, a * 0.35);
    }
  }

  // flat pixel clouds, drifting east to west through the day, lit by the horizon
  if (K.clouds > 0.01) {
    const ink = mixRGB(CLOUD, K.sky[n], 0.35);
    const drift = Math.round((h - DAY_START) * W * 0.035);
    for (const c of D.clouds) {
      const span = W + c.w * 2;
      const x0 = ((((c.x - drift) % span) + span) % span) - c.w;
      for (let row = 0; row < 3; row++) {
        const inset = row === 0 ? Math.floor(c.w * 0.25) : row === 2 ? 1 : 0;
        for (let x = x0 + inset; x < x0 + c.w - inset; x++) put(x, c.y + row, ink, K.clouds * (row === 2 ? 0.66 : 1));
      }
    }
  }

  // the sun, setting behind the far range; the moon rising in the east at night
  if (sun) {
    const disc = mixRGB(SUN_LOW, SUN_HIGH, Math.sqrt(sun.e));
    const R = D.r;
    for (let y = -R; y <= R; y++)
      for (let x = -R; x <= R; x++) {
        const r = Math.hypot(x, y) / R;
        if (r > 1) continue;
        put(sun.x + x, sun.y + y, disc, r > 0.8 && bayer(x + 8, y + 8) > 0.5 ? 0.6 : 1);
      }
  }
  const moonUp = clamp01((h - 20.2) / 1.6);
  if (moonUp > 0) {
    const R = D.r;
    const top = Math.max(R + 2, D.H * 0.16);
    const mx = Math.round(D.W * 0.2);
    const my = Math.round(horizon + R - moonUp * (horizon + R - top));
    for (let y = -R; y <= R; y++)
      for (let x = -R; x <= R; x++) {
        if (Math.hypot(x, y) > R + 0.25) continue;
        // a first-quarter moon, lit on the side of the sun that has gone west
        put(mx + x, my + y, MOON, x >= -R * 0.2 ? 1 : 0.16);
      }
  }

  // the three ranges, far to near
  const fills = [K.far, K.mid, K.near];
  for (let k = 0; k < 3; k++) {
    const top = tops[k];
    const c = fills[k];
    for (let x = 0; x < W; x++) {
      const t0 = Math.max(0, top[x]);
      for (let y = t0; y < H; y++) put(x, y, c);
      if (k === 0 && top[x] >= 0) put(x, top[x], K.rim, 0.55);
    }
    if (k === 1) {
      // pines along the middle ridge, in the near colour
      for (const p of D.pines) {
        const y0 = top[p.x];
        for (let j = 0; j < p.h; j++) {
          const half = Math.min(2, Math.floor(j / 2));
          for (let dx = -half; dx <= half; dx++) put(p.x + dx, y0 - p.h + j + 1, K.near);
        }
      }
      // somebody's home: windows light up one by one as the evening comes
      for (const w of D.windows) {
        if (K.lights <= w.th) continue;
        put(w.x, w.y, EMBER);
        put(w.x + 1, w.y, EMBER_SOFT);
        put(w.x, w.y - 1, EMBER, 0.35);
        put(w.x + 1, w.y - 1, EMBER, 0.35);
      }
    }
  }
}
