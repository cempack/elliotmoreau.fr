import type { RGB, SkyLight } from "@/components/os/wallpaper/light";
import { bearingDeg } from "./geo";

/**
 * The view from a Toulouse rooftop, all the way round, as pixel art: the
 * wallpaper's sky for the instant (its five stops, the glow round the sun,
 * the stars), the sun or the moon where they really are, the Pyrenees
 * along the south from six real peaks at their true bearings and heights
 * (one uniform exaggeration, snow dithered in, rose at dusk), a row of
 * terracotta roofs underfoot and a compass tape. Painted once into a
 * 288 × 28 buffer (1.25° a pixel); the horizon band only slides it.
 */

export const HZ_W = 288;
export const HZ_H = 28;
/** degrees per art pixel */
export const DEG_PX = 360 / HZ_W;
/** the horizon row: elevation 0, the foot of the mountains (behind the roofs) */
export const HORIZON = 20;
/** the compass tape's first row */
export const TAPE = 23;

type Peak = { name: string; m: number; lat: number; lon: number };

/** the six summits that make the skyline, west to east as seen from Toulouse */
export const PEAKS: Peak[] = [
  { name: "Canigou", m: 2784, lat: 42.5189, lon: 2.4567 },
  { name: "Pic Carlit", m: 2921, lat: 42.5712, lon: 1.9339 },
  { name: "Montcalm", m: 3077, lat: 42.6719, lon: 1.4011 },
  { name: "Aneto", m: 3404, lat: 42.6311, lon: 0.6572 },
  { name: "Pic du Midi", m: 2877, lat: 42.9364, lon: 0.1411 },
  { name: "Pic d'Anie", m: 2504, lat: 42.9497, lon: -0.7183 },
];

/** heights are measured over the foothills (~900 m), on one scale: Aneto
    stands 13 pixels over the horizon */
const FOOT = 900;
const EXAGGERATION = 13 / (3404 - FOOT);
/** how fast a summit's flanks fall away, pixels per degree */
const FLANK = 1.05;
/** the lesser summits between the named ones (bearing, metres): they make it a chain */
const SHOULDERS: [number, number][] = [
  [138, 1700],
  [153, 2250],
  [171, 2450],
  [195, 2500],
  [203, 2350],
  [222, 2650],
  [243, 2050],
  [257, 1650],
];
const heightOf = (m: number) => (m - FOOT) * EXAGGERATION;

export type PeakAt = Peak & { bearing: number; h: number };

export function peaksFrom(home: { lat: number; lon: number }): PeakAt[] {
  return PEAKS.map((p) => ({ ...p, bearing: bearingDeg(home, p), h: heightOf(p.m) }));
}

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => B4[((y & 3) << 2) | (x & 3)];
/** a fixed pseudo-random number in [0, 1) per integer */
const hash = (n: number) => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const pack = (c: RGB) =>
  ((255 << 24) | (Math.max(0, Math.min(255, c[2] | 0)) << 16) | (Math.max(0, Math.min(255, c[1] | 0)) << 8) | Math.max(0, Math.min(255, c[0] | 0))) >>> 0;

/** shortest signed angle from a to b, degrees */
export const angleTo = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

/** the skyline's height over the horizon (art pixels) at column x: `base` is
    the clean shape (for shading), `h` the jagged crest */
function ridge(peaks: PeakAt[], x: number) {
  const b = (x + 0.5) * DEG_PX;
  let base = 0;
  let apex = false;
  for (const p of peaks) {
    const d = Math.abs(angleTo(p.bearing, b));
    if (d < DEG_PX * 0.75) apex = true;
    base = Math.max(base, p.h - d * FLANK);
  }
  for (const [bearing, m] of SHOULDERS) base = Math.max(base, heightOf(m) - Math.abs(angleTo(bearing, b)) * FLANK * 1.15);
  // the chain between the summits, tapering out east and west
  const lo = Math.min(...peaks.map((p) => p.bearing)) - 14;
  const hi = Math.max(...peaks.map((p) => p.bearing)) + 14;
  const inChain = smooth(lo - 10, lo + 6, b) * (1 - smooth(hi - 6, hi + 10, b));
  base = Math.max(base, inChain * (2.6 + 1.2 * Math.sin(b * 0.31) * Math.sin(b * 0.13 + 1.7)));
  // a jagged crest, but never on a summit: those stay where they are
  const h = !apex && base > 0.5 ? base + (hash(x * 7 + 3) - 0.5) * 1.2 : base;
  return { h: Math.max(0, h), base, apex };
}

export type Inks = { ink950: string; ink900: string; paper: string; paper3: string };

const STAR: RGB = [235, 233, 225];
const SNOW: RGB = [238, 240, 236];
const ROOF: RGB = hex("#b06048");
const ROOF_DEEP: RGB = hex("#8a4434");
const ROOF_NIGHT: RGB = hex("#2a2230");
const STONE: RGB = hex("#d8ccb4");
const ROCK_NEAR: RGB = [22, 27, 28];
const ROCK_NIGHT: RGB = [6, 8, 9];

/**
 * Paint the full circle into `out` (HZ_W × HZ_H, RGBA as little-endian
 * uint32). `night` keeps the moon in when the sun is down.
 */
export function paintHorizon(out: Uint32Array, L: SkyLight, peaks: PeakAt[], inks: Inks) {
  const W = HZ_W;
  const put = (x: number, y: number, c: RGB) => {
    if (y >= 0 && y < HZ_H) out[y * W + (((x % W) + W) % W)] = pack(c);
  };
  const sunAz = L.sun.azimuth;
  const sunEl = L.sun.elevation;
  const glow = L.glow;
  const horizonC = L.sky[4];

  // the sky, dithered between the wallpaper's five stops, glowing round the sun
  for (let y = 0; y < HORIZON + 1; y++) {
    const f = (y / HORIZON) * 4;
    const j = Math.min(3, Math.floor(f));
    for (let x = 0; x < W; x++) {
      let c = bayer(x, y) < f - j ? L.sky[j + 1] : L.sky[j];
      const d = angleTo(sunAz, (x + 0.5) * DEG_PX);
      const g = L.glowAmt * Math.exp(-(d * d) / (2 * 38 * 38)) * (0.35 + 0.65 * (y / HORIZON)) * smooth(-14, -2, sunEl);
      if (bayer(x + 2, y + 1) < g * 1.6) c = mix(c, glow, 0.55);
      if (L.stars > 0.05 && y < HORIZON - 5 && hash(y * W + x) < 0.03 * L.stars) c = mix(c, STAR, 0.35 + 0.6 * hash(x * 31 + y));
      put(x, y, c);
    }
  }

  // where a body sits on the strip: the wallpaper's easing of height
  const bodyAt = (az: number, el: number) => {
    const k = el >= 0 ? Math.pow(el / 72, 0.72) : el / 72;
    return { x: Math.floor(az / DEG_PX), y: Math.round(HORIZON - 1 - k * (HORIZON - 2)) };
  };
  if (sunEl > -1.5) {
    const s = bodyAt(sunAz, sunEl);
    const core = mix(STAR, glow, 0.25 + 0.4 * (1 - smooth(2, 25, sunEl)));
    const rim = mix(glow, core, 0.35);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(s.x + dx, s.y + dy, dx && dy ? rim : core);
  } else if (L.moon.elevation > 0) {
    const m = bodyAt(L.moon.azimuth, L.moon.elevation);
    const lit = L.moon.lit;
    const waxing = L.moon.phase < 0.5;
    const bright = mix(horizonC, STAR, 0.9);
    const dark = mix(L.sky[1], STAR, 0.12);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx && dy && lit < 0.85) continue; // round it off unless it's near full
        const side = waxing ? dx : -dx;
        const on = lit > 0.85 || (lit > 0.35 ? side >= 0 : side === 1);
        put(m.x + dx, m.y + dy, on ? bright : dark);
      }
  }

  // the Pyrenees: hazed with the horizon, lit on the side facing the sun, snow up top
  const light = 0.3 + 0.7 * L.sunUp;
  // by night the range is a silhouette, darker than the sky behind it
  const rock = mix(ROCK_NIGHT, ROCK_NEAR, L.sunUp);
  const haze = mix(horizonC, rock, 0.42 + 0.3 * (1 - L.sunUp));
  const shade = mix(haze, rock, 0.3);
  const snowC = mix(mix(SNOW, glow, 0.45 * L.twilight), mix(horizonC, STAR, 0.4), 1 - light);
  const heights = new Float32Array(W);
  const shape = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const r = ridge(peaks, x);
    heights[x] = r.h;
    shape[x] = r.base;
  }
  const sunFromEast = sunAz < 180;
  for (let x = 0; x < W; x++) {
    const h = Math.round(heights[x]);
    if (h <= 0) continue;
    const top = HORIZON - h;
    // which flank, from the clean shape: one facing east (rising to the
    // right) catches the morning, one facing west the afternoon
    const facesEast = shape[(x + W - 1) % W] <= shape[(x + 1) % W];
    const lit = facesEast === sunFromEast;
    // snow on the high summits only, deepest on Aneto
    const snowLine = Math.max(0, h - 8);
    for (let y = top; y <= HORIZON; y++) {
      const fromTop = y - top;
      let c = lit ? haze : shade;
      if (lit && L.sunUp > 0.2 && bayer(x, y) < 0.18) c = mix(haze, glow, 0.25);
      if (snowLine > 0 && fromTop < snowLine && bayer(x + 1, y) > fromTop / snowLine - 0.15) c = lit ? snowC : mix(snowC, shade, 0.4);
      put(x, y, c);
    }
  }
  // the Pic du Midi's observatory: three pixels on its summit
  const midi = peaks.find((p) => p.name === "Pic du Midi");
  if (midi) {
    const x = Math.floor(midi.bearing / DEG_PX);
    const top = HORIZON - Math.round(heights[x]);
    const c = mix(STONE, horizonC, 1 - light * 0.8);
    put(x, top - 1, c);
    put(x, top - 2, c);
    put(x + 1, top - 1, c);
  }

  // terracotta roofs underfoot: houses two to five windows wide, some a
  // storey up with hipped ends, a chimney here and there, dark joints between
  const roofLit = mix(ROOF_NIGHT, ROOF, light);
  const roofDeep = mix(ROOF_NIGHT, ROOF_DEEP, light);
  const joint = mix(roofDeep, ROCK_NEAR, 0.5);
  let x = 0;
  let k = 0;
  while (x < W) {
    const w = 7 + Math.floor(hash(k * 13 + 5) * 11);
    const raised = Math.floor(hash(k * 17 + 9) * 3); // 0, 1 or 2 rows up
    const chimney = hash(k * 23 + 1) < 0.55 ? x + 2 + Math.floor(hash(k * 29) * (w - 4)) : -1;
    for (let i = 0; i < w && x + i < W; i++) {
      const cx = x + i;
      const end = Math.min(i, w - 1 - i); // hipped: the ends step down
      const ridgeY = HORIZON + 1 - Math.min(raised, end);
      for (let y = ridgeY; y < TAPE; y++) {
        const row = y - ridgeY;
        let c = row === 0 ? mix(roofLit, STONE, 0.14 * light) : (cx + (row & 1) * 2) % 4 === 0 ? roofDeep : roofLit;
        if (i === 0 && y > HORIZON) c = joint;
        put(cx, y, c);
      }
      if (cx === chimney) {
        put(cx, ridgeY - 1, roofDeep);
        put(cx, ridgeY - 2, roofDeep);
      }
    }
    x += w;
    k++;
  }

  // the compass tape: a tick every 10°, a longer one every 30°
  const tape = hex(inks.ink950);
  const tick = hex(inks.paper3);
  for (let y = TAPE; y < HZ_H; y++) for (let cx = 0; cx < W; cx++) put(cx, y, tape);
  for (let deg = 0; deg < 360; deg += 10) {
    const cx = Math.round(deg / DEG_PX);
    const long = deg % 30 === 0;
    put(cx, TAPE, tick);
    if (long) put(cx, TAPE + 1, tick);
  }
}
