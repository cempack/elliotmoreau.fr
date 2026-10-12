import type { RGB, SkyLight } from "@/components/os/wallpaper/light";
import { bearingDeg } from "./geo";

/**
 * The view from a Toulouse rooftop, all the way round, as pixel art: the
 * wallpaper's sky for the instant (its five stops as a clean gradient, the
 * glow round the sun, a few stars after dark), the sun or the moon where
 * they really are, the Pyrenees along the south from six real peaks at
 * their true bearings and heights (one uniform exaggeration) in front of a
 * hazier range behind them, snow on what stands high enough, the flank
 * facing the sun lit, and a row of terracotta roofs underfoot. Painted once
 * into a 576 × 44 buffer (0.625° a pixel); the horizon band only slides it.
 * The compass tape under it is CSS (hairlines stay one pixel wide).
 */

export const HZ_W = 576;
export const HZ_H = 44;
/** degrees per art pixel */
export const DEG_PX = 360 / HZ_W;
/** the horizon row: elevation 0, the foot of the mountains (behind the roofs) */
export const HORIZON = 37;

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
    stands 26 pixels over the horizon */
const FOOT = 900;
const EXAGGERATION = 26 / (3404 - FOOT);
/** how fast a summit's flanks fall away, pixels per degree */
const FLANK = 1.4;
/** snow lies above this */
const SNOW_M = 2400;
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

/** the chain's reach, tapering out east and west */
function chainOf(peaks: PeakAt[]) {
  const lo = Math.min(...peaks.map((p) => p.bearing)) - 14;
  const hi = Math.max(...peaks.map((p) => p.bearing)) + 14;
  return (b: number) => smooth(lo - 10, lo + 6, b) * (1 - smooth(hi - 6, hi + 10, b));
}

/** the near range's height over the horizon (art pixels) at column x:
    `base` is the clean shape (for light and snow), `h` the broken crest,
    `top` the bearing and height of the summit (or shoulder) it falls from */
function ridge(peaks: PeakAt[], inChain: (b: number) => number, x: number) {
  const b = (x + 0.5) * DEG_PX;
  let base = 0;
  let apex = false;
  let at = NaN;
  let tall = 0;
  for (const p of peaks) {
    const d = Math.abs(angleTo(p.bearing, b));
    if (d < DEG_PX * 0.75) apex = true;
    const v = p.h - d * FLANK;
    if (v > base) [base, at, tall] = [v, p.bearing, p.h];
  }
  for (const [bearing, m] of SHOULDERS) {
    const v = heightOf(m) - Math.abs(angleTo(bearing, b)) * FLANK * 1.15;
    if (v > base) [base, at, tall] = [v, bearing, heightOf(m)];
  }
  const chain = inChain(b) * (6.5 + 2.6 * Math.sin(b * 0.31) * Math.sin(b * 0.13 + 1.7));
  if (chain > base) [base, at] = [chain, NaN];
  // a broken crest, two pixels at a time, but never on a summit
  const h = !apex && base > 1 ? base + (hash(Math.floor(x / 2) * 7 + 3) - 0.5) * 1.4 : base;
  return { h: Math.max(0, h), base, at, tall };
}

const STAR: RGB = [235, 233, 225];
const SNOW: RGB = [240, 242, 238];
const ROOF: RGB = hex("#a0604c");
const ROOF_DEEP: RGB = hex("#8a4a3a");
const ROOF_NIGHT: RGB = hex("#2a2230");
const STONE: RGB = hex("#d8ccb4");
const ROCK_NEAR: RGB = [26, 31, 34];
const ROCK_NIGHT: RGB = [6, 8, 10];

/** Paint the full circle into `out` (HZ_W × HZ_H, RGBA as little-endian uint32). */
export function paintHorizon(out: Uint32Array, L: SkyLight, peaks: PeakAt[]) {
  const W = HZ_W;
  const put = (x: number, y: number, c: RGB) => {
    if (y >= 0 && y < HZ_H) out[y * W + (((x % W) + W) % W)] = pack(c);
  };
  const sunAz = L.sun.azimuth;
  const sunEl = L.sun.elevation;
  const glow = L.glow;
  const horizonC = L.sky[4];
  const glowOn = L.glowAmt * smooth(-14, -2, sunEl);

  // the sky: a clean gradient row by row through the wallpaper's five
  // stops, warmed toward the glow round the sun; a few small stars
  for (let y = 0; y < HORIZON + 1; y++) {
    const f = Math.min(1, (y + 0.5) / HORIZON) * 4;
    const j = Math.min(3, Math.floor(f));
    const row = mix(L.sky[j], L.sky[j + 1], f - j);
    const t = (y + 0.5) / HORIZON;
    for (let x = 0; x < W; x++) {
      const d = angleTo(sunAz, (x + 0.5) * DEG_PX);
      const g = glowOn * Math.exp(-(d * d) / (2 * 34 * 34)) * Math.pow(t, 1.5);
      let c = g > 0.004 ? mix(row, glow, Math.min(0.8, g * 1.2)) : row;
      if (L.stars > 0.05 && y < HORIZON - 9 && hash(y * W + x) < 0.009 * L.stars) c = mix(c, STAR, (0.25 + 0.55 * hash(x * 31 + y)) * L.stars);
      put(x, y, c);
    }
  }

  // where a body sits on the strip: the wallpaper's easing of height
  const bodyAt = (az: number, el: number) => {
    const k = el >= 0 ? Math.pow(el / 72, 0.72) : el / 72;
    return { x: az / DEG_PX, y: HORIZON - 1.5 - k * (HORIZON - 5) };
  };
  const disc = (cx: number, cy: number, r: number, paint: (x: number, y: number, nx: number, ny: number) => void) => {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const nx = (x + 0.5 - cx) / r;
        const ny = (y + 0.5 - cy) / r;
        if (nx * nx + ny * ny <= 1.08) paint(x, y, nx, ny);
      }
  };
  if (sunEl > -1.5) {
    const s = bodyAt(sunAz, sunEl);
    const low = 1 - smooth(2, 25, sunEl);
    const core = mix(hex("#fff8e4"), mix(STAR, glow, 0.55), low);
    const rim = mix(hex("#ffeab0"), glow, 0.35 + 0.4 * low);
    disc(s.x, s.y, 2.6, (x, y, nx, ny) => put(x, y, nx * nx + ny * ny > 0.55 ? rim : core));
  } else if (L.moon.elevation > 0 && L.moon.lit > 0.06) {
    const m = bodyAt(L.moon.azimuth, L.moon.elevation);
    const ph = Math.min(0.88, Math.max(0.12, L.moon.phase));
    const k = Math.cos(2 * Math.PI * ph);
    const waxing = ph < 0.5;
    const bright = mix(horizonC, STAR, 0.9);
    const dark = mix(L.sky[1], STAR, 0.1);
    disc(m.x, m.y, 2.2, (x, y, nx, ny) => {
      const half = Math.sqrt(Math.max(0, 1 - ny * ny));
      put(x, y, (waxing ? nx > k * half : nx < -k * half) ? bright : dark);
    });
  }

  // the Pyrenees: a hazy range behind, the named peaks in front
  const light = 0.3 + 0.7 * L.sunUp;
  // by night the range is a silhouette, darker than the sky behind it
  const rock = mix(ROCK_NIGHT, ROCK_NEAR, L.sunUp);
  const farC = mix(horizonC, rock, 0.14 + 0.34 * (1 - L.sunUp));
  const haze = mix(horizonC, rock, 0.28 + 0.46 * (1 - L.sunUp));
  const shade = mix(haze, rock, 0.2 + 0.12 * (1 - L.sunUp));
  const litC = mix(haze, mix(glow, STAR, 0.25), 0.2 * L.sunUp + 0.1 * L.twilight);
  const snowC = mix(mix(SNOW, glow, 0.45 * L.twilight), mix(horizonC, STAR, 0.4), 1 - light);
  const snowShade = mix(snowC, shade, 0.38);
  const inChain = chainOf(peaks);
  const heights = new Float32Array(W);
  const shape = new Float32Array(W);
  const apexAt = new Float32Array(W);
  const apexH = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const r = ridge(peaks, inChain, x);
    heights[x] = r.h;
    shape[x] = r.base;
    apexAt[x] = r.at;
    apexH[x] = r.tall;
  }
  for (let x = 0; x < W; x++) {
    const b = (x + 0.5) * DEG_PX;
    const far = inChain(b) * (11 + 5 * Math.sin(b * 0.19 + 1.3) + 2.5 * Math.sin(b * 0.47 + 0.4) + 1.2 * Math.sin(b * 1.3));
    const top = Math.round(HORIZON - far);
    for (let y = top; y <= HORIZON; y++) put(x, y, farC);
  }
  const sunFromEast = sunAz < 180;
  const snowLine = heightOf(SNOW_M);
  for (let x = 0; x < W; x++) {
    const h = Math.round(heights[x]);
    if (h <= 0) continue;
    const top = HORIZON - h;
    // which face: east faces (left on the strip, looking south) catch the
    // morning, west faces the afternoon. Under a summit the divide runs
    // down from its top and leans into the shaded side, so each one reads
    // as a solid; elsewhere the clean shape's slope decides
    const facesEast = shape[(x + W - 1) % W] <= shape[(x + 1) % W];
    const ax = apexAt[x] / DEG_PX;
    const peakTop = HORIZON - apexH[x];
    const lean = (y: number) => (y - peakTop) * 0.55;
    // the snow's lower edge, a pixel up or down column by column
    const edge = HORIZON - snowLine + (hash(Math.floor(x / 3) * 13 + 1) < 0.4 ? 1 : 0);
    for (let y = top; y <= HORIZON; y++) {
      let lit: boolean;
      if (Number.isNaN(ax)) lit = facesEast === sunFromEast;
      else {
        const dx = angleTo(ax * DEG_PX, (x + 0.5) * DEG_PX) / DEG_PX;
        lit = sunFromEast ? dx <= lean(y) : dx >= -lean(y);
      }
      let c = lit ? litC : shade;
      if (y < edge && shape[x] > snowLine) c = lit ? snowC : snowShade;
      put(x, y, c);
    }
  }
  // the Pic du Midi's observatory: a tower on its summit
  const midi = peaks.find((p) => p.name === "Pic du Midi");
  if (midi) {
    const x = Math.floor(midi.bearing / DEG_PX);
    const top = HORIZON - Math.round(heights[x]);
    const c = mix(STONE, horizonC, 1 - light * 0.8);
    for (let y = 1; y <= 3; y++) put(x, top - y, c);
    put(x + 1, top - 1, c);
  }

  // terracotta roofs underfoot: houses of every width, some a storey up
  // with hipped ends, a chimney here and there, a dark joint between
  // (they sit in the same air as everything else: a touch of the horizon)
  const roofLit = mix(ROOF_NIGHT, mix(ROOF, horizonC, 0.12), light);
  const roofCourse = mix(roofLit, mix(ROOF_NIGHT, ROOF_DEEP, light), 0.45);
  const roofDeep = mix(ROOF_NIGHT, ROOF_DEEP, light);
  const ridgeC = mix(roofLit, STONE, 0.22 * light);
  const joint = mix(roofDeep, ROCK_NEAR, 0.6);
  let x = 0;
  let k = 0;
  while (x < W) {
    const w = 12 + Math.floor(hash(k * 13 + 5) * 20);
    const raised = Math.floor(hash(k * 17 + 9) * 3); // 0 to 2 rows up
    const chimney = hash(k * 23 + 1) < 0.6 ? x + 3 + Math.floor(hash(k * 29) * (w - 6)) : -1;
    for (let i = 0; i < w && x + i < W; i++) {
      const cx = x + i;
      const end = Math.min(i, w - 1 - i); // hipped: the ends step down
      const ridgeY = HORIZON + 1 - Math.min(raised, end);
      for (let y = ridgeY; y < HZ_H; y++) {
        const row = y - ridgeY;
        // courses of tiles, the joints staggered course by course
        let c = row === 0 ? ridgeC : (cx + (row % 2) * 3) % 6 === 0 ? roofCourse : roofLit;
        if (i === 0 && y > HORIZON) c = joint;
        put(cx, y, c);
      }
      if (cx === chimney) {
        put(cx, ridgeY - 1, roofDeep);
        put(cx, ridgeY - 2, roofDeep);
        put(cx, ridgeY - 3, mix(roofDeep, STONE, 0.25 * light));
      }
    }
    x += w;
    k++;
  }
}
