/**
 * The sky a post went out under: the stars, the Milky Way, the moon, the
 * sun and four planets over Toulouse at the minute it was published, seen
 * from a window near the Capitole, in the Atlas globe's inks (one canvas
 * cell per art pixel, Bayer dither).
 *
 * The camera is stereographic (circles stay circles). Under the sky runs a
 * roofline all the way round, with Saint-Sernin to the north, Saint-Étienne
 * to the south-east and the dome of La Grave to the west, floodlit at
 * night, and windows lit by the local hour.
 *
 * Nothing here runs on its own: a `Sky` paints when asked (a new size, a
 * drag, a scroll step). `render` does the costly part once per camera and
 * minute; `compose` puts the constellation names, the date stamp and the
 * dithered foot on top, cheaply enough to run every frame of a fade.
 *
 * Positions are low precision on purpose (a few arcminutes for the sun
 * and planets, a fraction of a degree for the moon): at 3 px a cell, a
 * cell is about a quarter of a degree.
 */

import { PIXEL_FOLD, PIXEL_GLYPHS } from "@/components/PixelLabel";
import { TOULOUSE } from "@/lib/sun";
import { FIGURES, MILKY_WAY, NAMES, POLARIS as POLARIS_AT, STARS, STAR_COUNT } from "./catalog";

type RGB = [number, number, number];
type Vec = [number, number, number];

const R = Math.PI / 180;
const LAT = TOULOUSE.lat;
const LON = TOULOUSE.lon;

/* ───── the Atlas inks (src/components/apps/atlas/planet.ts) ───── */
const INK = {
  oceanDeep: [10, 13, 38],
  ocean: [15, 20, 55],
  oceanLit: [25, 33, 84],
  oceanNight: [5, 6, 17],
  oceanNight2: [8, 9, 24],
  landLo: [58, 63, 140],
  land: [86, 93, 192],
  landHi: [136, 129, 234],
  ice: [178, 172, 234],
  iceHi: [216, 212, 247],
  landNight: [27, 29, 68],
  landNight2: [34, 37, 84],
  light: [255, 184, 107],
  lightHot: [245, 242, 236],
} satisfies Record<string, RGB>;
type InkName = keyof typeof INK;

/** RGBA packed for a little-endian Uint32 view of ImageData */
const pack = ([r, g, b]: RGB, k = 1) =>
  ((255 << 24) | (Math.min(255, Math.round(b * k)) << 16) | (Math.min(255, Math.round(g * k)) << 8) | Math.min(255, Math.round(r * k))) >>> 0;
const P = Object.fromEntries(Object.entries(INK).map(([k, v]) => [k, pack(v as RGB)])) as Record<InkName, number>;
const amber = (k: number) => pack(INK.light, k);
const A30 = amber(0.3);
const A45 = amber(0.45);
const A60 = amber(0.6);
const A80 = amber(0.8);
/** the sky, dark to light: night indigo up through the globe's lit land to ice */
const SKY = (["oceanNight", "oceanNight2", "oceanDeep", "ocean", "oceanLit", "landNight2", "landLo", "land", "landHi", "ice", "iceHi", "lightHot"] as const).map((k) => P[k]);
/** the dusk, low over the sun: amber from embers to glare */
const WARM = [amber(0.36), amber(0.56), amber(0.76), P.light, pack([250, 213, 170])];

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const b4 = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const sstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function hash2(a: number, b: number) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mv = (M: number[], e: Vec): Vec => [
  M[0] * e[0] + M[1] * e[1] + M[2] * e[2],
  M[3] * e[0] + M[4] * e[1] + M[5] * e[2],
  M[6] * e[0] + M[7] * e[1] + M[8] * e[2],
];
const eqVec = (ra: number, dec: number): Vec => [Math.cos(dec * R) * Math.cos(ra * R), Math.cos(dec * R) * Math.sin(ra * R), Math.sin(dec * R)];
const EPS = 23.43928 * R;
const eclToEq = (v: Vec): Vec => [v[0], v[1] * Math.cos(EPS) - v[2] * Math.sin(EPS), v[1] * Math.sin(EPS) + v[2] * Math.cos(EPS)];

/* ───── the site's 3×5 capitals ───── */
export const textW = (s: string) => {
  let w = 0;
  for (const ch of s) w += ch === " " ? 2 : 4;
  return Math.max(0, w - 1);
};
/** pixel caps never had diacritics: fold them onto their base letter */
export const capitals = (s: string) =>
  Array.from(s.toUpperCase(), (ch) => PIXEL_FOLD[ch] ?? ch)
    .join("")
    .replace(/[^A-Z0-9 .,'/:-]/g, "");
function drawText(buf: Uint32Array, W: number, H: number, s: string, x: number, y: number, col: number, keep?: (x: number, y: number) => boolean) {
  for (const ch of s) {
    if (ch === " ") {
      x += 2;
      continue;
    }
    const g = PIXEL_GLYPHS[ch];
    if (g)
      for (let gy = 0; gy < 5; gy++)
        for (let gx = 0; gx < 3; gx++) {
          if (g[gy][gx] !== "1") continue;
          const X = x + gx;
          const Y = y + gy;
          if (X >= 0 && Y >= 0 && X < W && Y < H && (!keep || keep(X, Y))) buf[Y * W + X] = col;
        }
    x += 4;
  }
}

/* ───── the catalogue (./catalog.ts): stars to magnitude 5.8, 46 figures, the Milky Way ───── */
function view64(b64: string) {
  const s = atob(b64.replace(/\s+/g, ""));
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new DataView(u.buffer);
}
const NS = STAR_COUNT;
/** each star's direction (equatorial unit vector), magnitude and B−V colour, faintest first */
const SV = new Float32Array(NS * 3);
const SMAG = new Float32Array(NS);
const SBV = new Float32Array(NS);
{
  const d = view64(STARS);
  for (let i = 0; i < NS; i++) {
    SV.set(eqVec(d.getInt16(i * 6, true) / 10, d.getInt16(i * 6 + 2, true) / 10), i * 3);
    SMAG[i] = d.getInt8(i * 6 + 4) / 10;
    SBV[i] = d.getInt8(i * 6 + 5) / 10;
  }
}
type Figure = { name: string; at: Vec; lines: Vec[][] };
const CONS: Figure[] = (() => {
  const d = view64(FIGURES);
  let o = 0;
  const next = () => {
    const v = d.getInt16(o, true);
    o += 2;
    return v;
  };
  return NAMES.map((name) => {
    const at = eqVec(next() / 10, next() / 10);
    const lines = Array.from({ length: next() }, () => Array.from({ length: next() }, () => eqVec(next() / 10, next() / 10)));
    return { name, at, lines };
  });
})();
const POLARIS = eqVec(POLARIS_AT[0], POLARIS_AT[1]);
/** the Milky Way on a 720×360 grid of ½° cells: how many of its contours cover each */
const MW = (() => {
  const d = view64(MILKY_WAY);
  const g = new Uint8Array(720 * 360);
  for (let o = 0, i = 0; o < d.byteLength; o += 2) {
    const r = d.getUint16(o, true);
    g.fill(r >> 12, i, i + (r & 4095));
    i += r & 4095;
  }
  return g;
})();
function mwAt(ra: number, dec: number) {
  // bilinear on the ½° grid, so the band's edges dither instead of stepping
  const fx = ((((ra / R) % 360) + 360) % 360) * 2 - 0.5;
  const fy = (90 - dec / R) * 2 - 0.5;
  const x0 = Math.floor(fx);
  const y0 = clamp(Math.floor(fy), 0, 358);
  const tx = fx - x0;
  const ty = clamp(fy - y0, 0, 1);
  const xa = (x0 + 720) % 720;
  const xb = (x0 + 721) % 720;
  const a = MW[y0 * 720 + xa];
  const b = MW[y0 * 720 + xb];
  const c = MW[(y0 + 1) * 720 + xa];
  const e = MW[(y0 + 1) * 720 + xb];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
}

/* ───── where everything was: sidereal time, the sun, the moon, four planets ───── */
function sunEq(d: number) {
  const L = 280.46 + 0.9856474 * d;
  const g = (357.528 + 0.9856003 * d) * R;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * R;
  return eclToEq([Math.cos(lam), Math.sin(lam), 0]);
}
function moonEq(d: number) {
  const T = d / 36525;
  const s = (a: number, b: number) => Math.sin((a + b * T) * R);
  const lam =
    (218.32 +
      481267.881 * T +
      6.29 * s(134.9, 477198.85) -
      1.27 * s(259.2, -413335.38) +
      0.66 * s(235.7, 890534.23) +
      0.21 * s(269.9, 954397.7) -
      0.19 * s(357.5, 35999.05) -
      0.11 * s(186.6, 966404.05)) *
    R;
  const bet = (5.13 * s(93.3, 483202.03) + 0.28 * s(228.2, 960400.87) - 0.28 * s(318.3, 6003.18) - 0.17 * s(217.6, -407332.2)) * R;
  return eclToEq([Math.cos(bet) * Math.cos(lam), Math.cos(bet) * Math.sin(lam), Math.sin(bet)]);
}
/** JPL's approximate Keplerian elements: a, e, I, L, ϖ, Ω at J2000, the same per century, then the magnitude at 1 au */
const EL = {
  Venus: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255, 0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418, -4.4],
  Earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0, 0],
  Mars: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343, -1.52],
  Jupiter: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106, -9.4],
  Saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794, -8.88],
};
function helio(el: number[], T: number): Vec {
  const a = el[0] + el[6] * T;
  const e = el[1] + el[7] * T;
  const I = (el[2] + el[8] * T) * R;
  const L = el[3] + el[9] * T;
  const wb = el[4] + el[10] * T;
  const Om = el[5] + el[11] * T;
  const w = (wb - Om) * R;
  const O = Om * R;
  const M = (((((L - wb) % 360) + 540) % 360) - 180) * R;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const cO = Math.cos(O);
  const sO = Math.sin(O);
  const cI = Math.cos(I);
  const sI = Math.sin(I);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}
const PLANETS = ["Venus", "Mars", "Jupiter", "Saturn"] as const;
const PLANET_INK: Record<(typeof PLANETS)[number], InkName> = { Venus: "lightHot", Mars: "light", Jupiter: "iceHi", Saturn: "ice" };

export type SkyAt = {
  ms: number;
  /** equatorial → horizon (x east, y north, z up), and back */
  M: number[];
  Mt: number[];
  sunH: Vec;
  moonH: Vec;
  sunAlt: number;
  moonAlt: number;
  /** the share of the moon's disc that is lit */
  moonK: number;
  pole: Vec;
  planets: { i: number; h: Vec; mag: number; ink: number }[];
};
const skies = new Map<number, SkyAt>();
/** the sky over Toulouse at a moment, to the quarter minute */
export function skyAt(ms: number): SkyAt {
  ms = Math.round(ms / 15000) * 15000;
  const hit = skies.get(ms);
  if (hit) return hit;
  const d = ms / 86400000 + 2440587.5 - 2451545;
  const th = ((((280.46061837 + 360.98564736629 * d + LON) % 360) + 360) % 360) * R;
  const f = LAT * R;
  const sf = Math.sin(f);
  const cf = Math.cos(f);
  const st = Math.sin(th);
  const ct = Math.cos(th);
  const M = [-st, ct, 0, -sf * ct, -sf * st, cf, cf * ct, cf * st, sf];
  const Mt = [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
  const sunE = sunEq(d);
  const moonE = moonEq(d);
  const sunH = mv(M, sunE);
  const moonH = mv(M, moonE);
  const T = d / 36525;
  const earth = helio(EL.Earth, T);
  const planets = PLANETS.map((name, i) => {
    const h = helio(EL[name], T);
    const g: Vec = [h[0] - earth[0], h[1] - earth[1], h[2] - earth[2]];
    const r = Math.hypot(h[0], h[1], h[2]);
    const D = Math.hypot(g[0], g[1], g[2]);
    return { i, h: mv(M, eclToEq(norm(g))), mag: EL[name][12] + 5 * Math.log10(r * D), ink: P[PLANET_INK[name]] };
  });
  const s: SkyAt = {
    ms,
    M,
    Mt,
    sunH,
    moonH,
    planets,
    sunAlt: Math.asin(sunH[2]) / R,
    moonAlt: Math.asin(moonH[2]) / R,
    moonK: (1 - dot(sunE, moonE)) / 2,
    pole: mv(M, [0, 0, 1]),
  };
  if (skies.size > 600) skies.clear();
  skies.set(ms, s);
  return s;
}
/** how far the sky has gone from day (0) to night (1), by the sun's altitude */
const DUSK = [
  [6, 0],
  [0, 0.3],
  [-3, 0.5],
  [-6, 0.68],
  [-9, 0.82],
  [-12, 0.92],
  [-16, 1],
];
export function darkness(sunAlt: number) {
  if (sunAlt >= DUSK[0][0]) return 0;
  for (let i = 1; i < DUSK.length; i++)
    if (sunAlt >= DUSK[i][0]) {
      const [a0, v0] = DUSK[i - 1];
      const [a1, v1] = DUSK[i];
      return v0 + ((sunAlt - a0) / (a1 - a0)) * (v1 - v0);
    }
  return 1;
}
/** how faint a star still shows: Toulouse's own glow at night, less as the sky brightens */
function limitMag(sunAlt: number) {
  if (sunAlt >= 0) return -3.5;
  if (sunAlt > -6) return -1 + (-sunAlt / 6) * 2.6;
  if (sunAlt > -12) return 1.6 + ((-sunAlt - 6) / 6) * 2.2;
  if (sunAlt > -18) return 3.8 + ((-sunAlt - 12) / 6) * 1.8;
  return 5.6;
}
/** the faintest star that shows, the moon's glare taken off */
const limitOf = (sky: SkyAt) => limitMag(sky.sunAlt) - (sky.moonAlt > 0 ? sky.moonK * 0.9 * darkness(sky.sunAlt) : 0);

/** a daytime post's exposure opens at that evening's sunset (its own minute otherwise) */
export function exposureStart(ms: number) {
  for (let i = 0; i < 200 && skyAt(ms).sunAlt > -0.8; i++) ms += 5 * 60000;
  return ms;
}

/* Toulouse local time, for the stamp and the windows */
const PARIS = new Intl.DateTimeFormat("en-GB", {
  timeZone: TOULOUSE.tz,
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
function paris(ms: number) {
  const o: Record<string, string> = {};
  for (const p of PARIS.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}
/** a film camera's date stamp: 'YY MM DD HH:MM (no year when it's narrow) */
const stampOf = (ms: number, short: boolean) => {
  const o = paris(ms);
  return `${short ? "" : `'${o.year} `}${o.month} ${o.day} ${o.hour}:${o.minute}`;
};
/** HH:MM in Toulouse */
export const clockOf = (ms: number) => {
  const o = paris(ms);
  return `${o.hour}:${o.minute}`;
};
/** the share of windows still lit at that local hour */
function litShare(ms: number, sunAlt: number) {
  if (sunAlt > 2) return 0;
  const o = paris(ms);
  const h = +o.hour + +o.minute / 60;
  if (h >= 17 && h < 22) return 0.36;
  if (h >= 22) return 0.36 - (h - 22) * 0.07;
  if (h < 1) return 0.22 - h * 0.06;
  if (h < 5) return Math.max(0.05, 0.16 - (h - 1) * 0.03);
  return 0.12;
}

/* ───── the roofline: Toulouse from a window near the Capitole, a quarter degree a sample ───── */
const ROOF = new Float32Array(1440);
/** 1 Saint-Sernin, 2 La Grave, 3 Saint-Étienne */
const RK = new Uint8Array(1440);
/** where the landmarks stand (azimuth, degrees): each post's picture faces one of them */
const LANDMARKS = [2, 128, 262];
{
  const rnd = rng(1229);
  let a = 0;
  while (a < 360) {
    const w = 2.4 + rnd() * 7;
    const h = 2 + rnd() * 3.6 + (rnd() < 0.16 ? 2.2 : 0);
    const gable = rnd() < 0.72;
    const pk = 0.4 + rnd() * 0.7;
    const ch1 = rnd() < 0.7 ? a + 0.5 + rnd() * (w - 1) : -9;
    const ch2 = rnd() < 0.3 ? a + 0.5 + rnd() * (w - 1) : -9;
    const ant = rnd() < 0.2 ? a + 0.5 + rnd() * (w - 1) : -9;
    for (let i = Math.round(a * 4); i < Math.round((a + w) * 4) && i < 1440; i++) {
      const az = i / 4;
      const t = (az - a) / w;
      let top = h + (gable ? pk * (1 - Math.abs(t * 2 - 1)) : 0);
      if (Math.abs(az - ch1) < 0.32 || Math.abs(az - ch2) < 0.32) top = Math.max(top, h + pk + 0.85);
      if (Math.abs(az - ant) < 0.12) top = Math.max(top, h + pk + 2.4);
      ROOF[i] = top;
    }
    a += w;
  }
  const landmark = (c: number, kind: number, prof: (d: number) => number) => {
    for (let d = -12; d <= 12; d += 0.25) {
      const t = prof(Math.abs(d));
      const i = (((Math.round((c + d) * 4) % 1440) + 1440) % 1440);
      if (t > ROOF[i] - 0.01) {
        ROOF[i] = Math.max(ROOF[i], t);
        RK[i] = kind;
      }
    }
  };
  // Saint-Sernin, north: the long nave, then the octagonal belltower in five tiers and its spire
  landmark(LANDMARKS[0], 1, (d) =>
    d < 1 ? 18.4 + (1 - d) * 5.4 : d < 1.2 ? 18.4 : d < 1.5 ? 16.9 : d < 1.85 ? 15.2 : d < 2.25 ? 13.3 : d < 2.65 ? 11.2 : d < 3.6 ? 8.6 : d < 9.5 ? 7.4 : 0,
  );
  // Saint-Étienne, south-east: the square tower, its little pyramid
  landmark(LANDMARKS[1], 3, (d) => (d < 1.8 ? 12.4 + (d < 1 ? (1 - d) * 1.1 : 0) : d < 4.5 ? 6.6 : 0));
  // La Grave, west across the Garonne: a dome on its drum, the lantern on top
  landmark(LANDMARKS[2], 2, (d) => (d < 0.35 ? 12.6 : d < 3 ? 7.6 + Math.sqrt(9 - d * d) * 1.05 : d < 3.4 ? 7.6 : 0));
}

/**
 * Where a post's picture looks when neither the sun nor the moon is up:
 * towards one of the landmarks, a little to the side (by its slug), the
 * one with the most over it then: the Milky Way, bright stars, planets.
 */
export function faceOf(slug: string, ms: number) {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 16777619);
  h >>>= 0;
  const lean = ((h >>> 8) % 25) - 12;
  const sky = skyAt(ms);
  const { M, Mt } = sky;
  const lim = limitOf(sky);
  let face = (LANDMARKS[h % 3] + lean + 360) % 360;
  let best = 0;
  for (const mark of LANDMARKS) {
    const az = mark + lean;
    let score = 0;
    // the Milky Way over this stretch of roofs
    for (let da = -24; da <= 24; da += 6)
      for (let alt = 6; alt <= 30; alt += 6) {
        const A = (az + da) * R;
        const B = alt * R;
        const d: Vec = [Math.sin(A) * Math.cos(B), Math.cos(A) * Math.cos(B), Math.sin(B)];
        const e = mv(Mt, d);
        score += mwAt(Math.atan2(e[1], e[0]), Math.asin(clamp(e[2], -1, 1))) * 0.25;
      }
    // bright stars and planets in the frame
    const inFrame = (v: Vec) => {
      const alt = Math.asin(clamp(v[2], -1, 1)) / R;
      const off = Math.abs((((Math.atan2(v[0], v[1]) / R - az) % 360) + 540) % 360 - 180);
      return alt > 4 && alt < 32 && off < 26;
    };
    for (let i = NS - 1; i >= 0 && SMAG[i] < 2.2; i--) {
      if (SMAG[i] > lim) continue;
      if (inFrame(mv(M, [SV[i * 3], SV[i * 3 + 1], SV[i * 3 + 2]]))) score += 2.4 - SMAG[i];
    }
    for (const pl of sky.planets) if (pl.mag < lim + 1.2 && inFrame(pl.h)) score += 4;
    if (score > best + 0.5) {
      best = score;
      face = (az + 360) % 360;
    }
  }
  return face;
}

/* ───── the view: a stereographic camera on the sky ───── */
export type Fov = { h: number } | { v: number };
type View = { W: number; H: number; S: number; f: Vec; r: Vec; u: Vec; cx: number; cy: number };
function makeView(W: number, H: number, az: number, alt: number, fov: Fov): View {
  const S = "h" in fov ? W / 2 / (2 * Math.tan((fov.h * R) / 2)) : H / 2 / (2 * Math.tan((fov.v * R) / 2));
  const A = az * R;
  const B = alt * R;
  const f: Vec = [Math.sin(A) * Math.cos(B), Math.cos(A) * Math.cos(B), Math.sin(B)];
  const r: Vec = [Math.cos(A), -Math.sin(A), 0];
  return { W, H, S, f, r, u: cross(r, f), cx: W / 2, cy: H / 2 };
}
function proj(v: View, h: Vec): [number, number] | null {
  const cz = dot(h, v.f);
  if (cz < -0.3) return null;
  const k = (2 / (1 + cz)) * v.S;
  return [v.cx + dot(h, v.r) * k, v.cy - dot(h, v.u) * k];
}

const LUNAR_SEAS = [
  [18, -57, 26, 24],
  [33, -16, 15, 17],
  [28, 17, 9, 10],
  [8, 31, 10, 12],
  [17, 59, 7, 7],
  [-8, 51, 9, 7],
  [-15, 34, 5, 6],
  [-21, -17, 9, 12],
  [-24, -39, 6, 6],
  [56, 0, 5, 30],
  [13, 4, 4, 5],
  [-10, -23, 5, 6],
  [-2, -15, 8, 9],
];

export type SkyOptions = {
  fov: Fov;
  /** the altitude, in degrees, at the bottom edge (or at the top of the dithered foot) */
  bottom: number;
  moonR: number;
  sunR: number;
  /** the amber film-camera date in the corner */
  stamp?: boolean;
  /** face north over Saint-Sernin, whatever is up (the long exposure) */
  north?: boolean;
  /** how far past the sun or the moon the first look leans, in degrees */
  offset?: number;
  /** keep the roofs in the first look, however high the sun or the moon (small pictures) */
  horizon?: boolean;
  /** rows dithered into the glass along the bottom, so a title can sit there */
  fade?: number;
  /** the planets' names in the reader's language: Venus, Mars, Jupiter, Saturn */
  planets?: readonly string[];
};

/**
 * One sky on one grid of cells. Give it a size and a moment, then
 * `paint` into an ImageData's Uint32 view. `look` turns the camera,
 * `names` (0–1) dissolves the constellation figures in, `trail` lays a
 * long exposure under the stars.
 */
export class Sky {
  W = 0;
  H = 0;
  az = 180;
  alt = 20;
  ms = 0;
  face = 180;
  /** the constellations shown, 0..1, dissolved in Bayer order */
  names = 0;
  trail: Exposure | null = null;
  /** sky, trails, stars, moon and sun: everything under the names and the stamp */
  base = new Uint32Array(0);
  mask = new Uint8Array(0);
  private dirs: Float32Array | null = null;
  private shown: { name: string; x: number; y: number }[] = [];
  private planetNames: string[];

  constructor(public o: SkyOptions) {
    this.planetNames = (o.planets ?? PLANETS).map(capitals);
  }

  /** true when the grid changed */
  size(W: number, H: number) {
    if (W < 8 || H < 6 || (W === this.W && H === this.H)) return false;
    this.W = W;
    this.H = H;
    this.base = new Uint32Array(W * H);
    this.mask = new Uint8Array(W * H);
    this.dirs = null;
    if (this.ms) this.aim();
    return true;
  }

  /** a new moment (and the way the picture faces when nothing's up): the camera goes back to its first look */
  set(ms: number, face: number) {
    this.ms = ms;
    this.face = face;
    if (this.W) this.aim();
  }

  private get scale() {
    return makeView(this.W, this.H, 0, 0, this.o.fov).S;
  }
  /** degrees of sky per cell at the middle of the view */
  get degPerCell() {
    return 1 / this.scale / R;
  }
  /** the camera's altitude that puts the foot (or the bottom edge) at `bottom` degrees */
  bottomAlt() {
    const half = this.H / 2 - (this.o.fade ?? 0);
    return this.o.bottom + (2 * Math.atan(half / this.scale / 2)) / R;
  }
  /** where to look first: the sun's side by day and at dusk, the moon when it's up, else the post's landmark */
  aim() {
    const sky = skyAt(this.ms);
    const min = this.bottomAlt();
    const azOf = (h: Vec) => (Math.atan2(h[0], h[1]) / R + 360) % 360;
    const off = this.o.offset ?? 0;
    if (this.o.north) {
      this.az = 0;
      this.alt = min;
    } else if (sky.sunAlt > -12) {
      this.az = azOf(sky.sunH) + (sky.sunAlt > 2 ? off : 0);
      this.alt = Math.max(min, sky.sunAlt - 18);
    } else if (sky.moonAlt > 4) {
      this.az = azOf(sky.moonH) + off;
      this.alt = Math.max(min, sky.moonAlt - 6);
    } else {
      this.az = this.face;
      this.alt = min;
    }
    if (this.o.horizon) this.alt = min;
    this.dirs = null;
  }
  look(dAz: number, dAlt: number) {
    this.az = (((this.az + dAz) % 360) + 360) % 360;
    this.alt = clamp(this.alt + dAlt, this.bottomAlt(), 62);
    this.dirs = null;
  }
  view() {
    const v = makeView(this.W, this.H, this.az, this.alt, this.o.fov);
    if (!this.dirs) {
      // each cell's direction on the sky, kept until the camera moves
      const d = new Float32Array(this.W * this.H * 3);
      for (let y = 0, k = 0; y < this.H; y++)
        for (let x = 0; x < this.W; x++, k += 3) {
          const X = (x + 0.5 - v.cx) / v.S;
          const Y = (v.cy - y - 0.5) / v.S;
          const q = X * X + Y * Y;
          const den = 4 + q;
          const a = (4 * X) / den;
          const b = (4 * Y) / den;
          const c = (4 - q) / den;
          d[k] = a * v.r[0] + b * v.u[0] + c * v.f[0];
          d[k + 1] = a * v.r[1] + b * v.u[1] + c * v.f[1];
          d[k + 2] = a * v.r[2] + b * v.u[2] + c * v.f[2];
        }
      this.dirs = d;
    }
    return v;
  }

  /** the costly part: once per camera and moment */
  render() {
    if (!this.W || !this.ms) return;
    const v = this.view();
    const sky = skyAt(this.ms);
    this.paintSky(sky);
    this.trail?.draw(this.base, this.mask);
    this.paintStars(v, sky);
    this.paintMoonSun(v, sky);
  }
  /** the names, the stamp and the dithered foot over the last render, into `out` (W×H) */
  compose(out: Uint32Array) {
    const { W, H } = this;
    if (!W || out.length !== W * H) return;
    out.set(this.base);
    const st = this.stampAt();
    if (this.names > 0) this.paintNames(out, st);
    // the foot: the windows go out towards the bottom, then the street dithers
    // into the glass, so the date and the title read on a quiet dark
    const fade = this.o.fade ?? 0;
    if (fade > 0) {
      const foot = darkness(skyAt(this.ms).sunAlt) > 0.35 ? P.oceanNight : P.oceanLit;
      const ramp = Math.round(fade * 0.6);
      for (let y = Math.max(0, H - fade - ramp); y < H - fade; y++) {
        const t = (y - (H - fade - ramp) + 1) / (ramp + 1);
        for (let x = 0, i = y * W; x < W; x++, i++) if (this.mask[i] && b4(x, y) < t) out[i] = foot;
      }
      for (let y = Math.max(0, H - fade); y < H; y++) {
        const keep = (H - y) / fade;
        for (let x = 0, i = y * W; x < W; x++, i++) out[i] = b4(x, y) >= keep ? 0 : foot;
      }
    }
    if (st) {
      drawText(out, W, H, st.s, st.x + 1, st.y + 1, P.oceanNight);
      drawText(out, W, H, st.s, st.x, st.y, P.light);
    }
  }
  paint(out: Uint32Array) {
    this.render();
    this.compose(out);
  }

  private stampAt() {
    if (!this.o.stamp) return null;
    const s = stampOf(this.ms, this.W < 170);
    const x = this.W - textW(s) - 3;
    const y = this.H - (this.o.fade ?? 0) - 8;
    return x > 2 && y > 2 ? { s, x, y } : null;
  }

  private paintSky(sky: SkyAt) {
    const { W, H, base: buf, mask } = this;
    const dirs = this.dirs!;
    const dark = darkness(sky.sunAlt);
    const twi = clamp(1 - Math.abs(sky.sunAlt + 3.5) / 9.5, 0, 1);
    const sun = sky.sunH;
    const moon = sky.moonH;
    const Mt = sky.Mt;
    const sh = Math.hypot(sun[0], sun[1]) || 1;
    const sx = sun[0] / sh;
    const sy = sun[1] / sh;
    const moonUp = sky.moonAlt > -2;
    const moonGlow = moonUp ? dark * sky.moonK * 1.7 : 0;
    const mwK = dark * dark * (1 - (moonUp ? 0.6 * sky.moonK : 0));
    const lit = litShare(sky.ms, sky.sunAlt);
    const night = dark > 0.5;
    const body = dark > 0.35 ? P.oceanNight : P.oceanLit;
    const rim = dark > 0.35 ? P.landNight : P.landLo;
    const sunGlow = sky.sunAlt > -8 ? 1 - dark : 0;
    for (let y = 0, k = 0, j = 0; y < H; y++) {
      for (let x = 0; x < W; x++, k++, j += 3) {
        const hx = dirs[j];
        const hy = dirs[j + 1];
        const hz = dirs[j + 2];
        const alt = Math.asin(hz > 1 ? 1 : hz < -1 ? -1 : hz) / R;
        const b = b4(x, y);
        let az = Math.atan2(hx, hy) / R;
        if (az < 0) az += 360;
        const ri = (az * 4) | 0;
        const roof = ROOF[ri];
        if (alt < roof) {
          mask[k] = 1;
          buf[k] = this.roofInk(ri, az, alt, roof, b, night, lit, body, rim);
          continue;
        }
        mask[k] = 0;
        const ah = alt > 0 ? alt / 90 : 0;
        const low = alt > 0 ? alt : 0;
        const nightV = 0.45 + 1.5 * (1 - ah) ** 4 + 2.5 * Math.exp(-low / 7);
        const dayV = 6.1 + 2.4 * (1 - ah) ** 2.4;
        let val = dayV + (nightV - dayV) * dark;
        if (sunGlow > 0) {
          const cs = hx * sun[0] + hy * sun[1] + hz * sun[2];
          if (cs > 0) val += sunGlow * (2.2 * cs ** 14 + 0.6 * cs ** 3);
        }
        if (moonGlow > 0) {
          const cm = hx * moon[0] + hy * moon[1] + hz * moon[2];
          if (cm > 0.9) val += moonGlow * Math.exp((cm - 1) * 70);
        }
        let dust = false;
        if (mwK > 0.02 && alt > 0) {
          const ex = Mt[0] * hx + Mt[1] * hy + Mt[2] * hz;
          const ey = Mt[3] * hx + Mt[4] * hy + Mt[5] * hz;
          const ez = Mt[6] * hx + Mt[7] * hy + Mt[8] * hz;
          const ra = Math.atan2(ey, ex);
          const dec = Math.asin(ez > 1 ? 1 : ez < -1 ? -1 : ez);
          const lv = mwAt(ra, dec);
          if (lv > 0) {
            val += lv * 0.78 * mwK * sstep(0, 20, alt);
            dust = hash2((ra / R) * 2.6, (dec / R) * 2.6 + 400) < 0.045 * lv * mwK;
          }
        }
        let warm = 0;
        if (twi > 0) {
          const hh = Math.hypot(hx, hy) || 1;
          const ca = (hx * sx + hy * sy) / hh;
          if (ca > -0.35) warm = twi * ((ca + 0.35) / 1.35) ** 4 * Math.exp(-low / 11) * 1.75;
          val += warm * 1.6;
        }
        if (warm > 0.08 + b * 0.9) {
          buf[k] = WARM[clamp((warm * 4.2 + b - 0.6) | 0, 0, 4)];
          continue;
        }
        if (dust) {
          buf[k] = val < 2.6 ? P.landNight2 : P.landLo;
          continue;
        }
        buf[k] = SKY[clamp(Math.floor(val + b - 0.5), 0, 11)];
      }
    }
  }
  private roofInk(ri: number, az: number, alt: number, roof: number, b: number, night: boolean, lit: number, body: number, rim: number) {
    let kind = RK[ri];
    // below its own walls a monument is just the street in front of it
    if (kind && alt < (kind === 1 ? 2.8 : kind === 2 ? 3.6 : 6.4)) kind = 0;
    if (kind === 2 && night) {
      // La Grave, lit cool: the dome shaded as a sphere, its drum dark with lit arches, the lantern
      const d = Math.abs(((az - LANDMARKS[2] + 540) % 360) - 180);
      if (alt > 10.6) return roof - alt < 0.5 ? P.iceHi : P.ice;
      if (alt > 7.6) {
        const s = Math.sqrt(Math.max(0, 1 - (d / 3.05) ** 2)) * 0.75 + 0.35 * (1 - (alt - 7.6) / 3.2) - 0.1;
        return roof - alt < 0.45 ? P.ice : s > b ? (s - 0.55 > b * 0.5 ? P.ice : P.landHi) : P.landLo;
      }
      if (d < 3.2 && d % 0.95 < 0.42 && alt > 4.4 && alt < 6.9) return alt > 6.2 ? P.landHi : P.landLo;
      return alt > 7.2 ? P.landLo : P.landNight2;
    }
    if (kind && night) {
      // the floodlit churches: Saint-Sernin and Saint-Étienne, warm
      const top = kind === 1 ? 23.8 : 13.5;
      const f = 0.25 + 0.55 * clamp(alt / top, 0, 1);
      if (kind === 1 && alt > 8.6 && alt < 18.2) {
        // arcades on each tier of the belltower
        const d = Math.abs(((az - LANDMARKS[0] + 540) % 360) - 180);
        if (d % 0.62 < 0.3 && (alt - 8.6) % 2.05 > 0.55 && (alt - 8.6) % 2.05 < 1.55) return A30;
      }
      return f > b ? (f > 0.62 + b * 0.3 ? P.light : A80) : A45;
    }
    if (kind && !night) return roof - alt < 0.5 ? P.land : alt / roof > b ? P.landLo : P.landNight2;
    if (roof - alt < 0.5) return rim;
    if (alt > -9 && alt < roof - 1.1) {
      const ca = az / 1.25;
      const row = (alt + 10) / 1.5;
      if (ca % 1 < 0.44 && row % 1 > 0.32 && row % 1 < 0.86) {
        const h = hash2(ca | 0, row | 0);
        if (!night && lit === 0) return h < 0.5 ? P.oceanDeep : body;
        if (h < lit) {
          const c = hash2((ca | 0) + 7, row | 0);
          return c < 0.06 ? P.lightHot : c < 0.12 ? P.ice : c < 0.4 ? A60 : P.light;
        }
        return night ? P.oceanNight2 : P.landNight;
      }
    }
    return body;
  }
  private starInk(mag: number, bv: number, lim: number) {
    let c = mag < 0.6 ? 5 : mag < 1.6 ? 4 : mag < 2.6 ? 3 : mag < 3.6 ? 2 : mag < 4.4 ? 1 : 0;
    if (lim - mag < 0.7) c = Math.max(0, c - 1);
    if (bv > 1.15 && mag < 3.2) return c >= 4 ? P.light : c >= 2 ? A80 : A60;
    return [P.landLo, P.land, P.landHi, P.ice, P.iceHi, P.lightHot][c];
  }
  private put(x: number, y: number, c: number) {
    const { W, H } = this;
    if (x >= 0 && y >= 0 && x < W && y < H && !this.mask[y * W + x]) this.base[y * W + x] = c;
  }
  private paintStars(v: View, sky: SkyAt) {
    const { W, H, base: buf, mask } = this;
    const M = sky.M;
    const { f, r, u, S } = v;
    const lim0 = limitOf(sky);
    if (lim0 >= -2)
      for (let i = 0; i < NS; i++) {
        const e0 = SV[i * 3];
        const e1 = SV[i * 3 + 1];
        const e2 = SV[i * 3 + 2];
        const hz = M[6] * e0 + M[7] * e1 + M[8] * e2;
        if (hz < 0.005) continue;
        const alt = Math.asin(hz) / R;
        const mag = SMAG[i];
        // stars fade into the haze near the horizon
        const lim = alt < 18 ? lim0 - (18 - alt) * 0.1 : lim0;
        if (mag > lim) continue;
        const hx = M[0] * e0 + M[1] * e1 + M[2] * e2;
        const hy = M[3] * e0 + M[4] * e1 + M[5] * e2;
        const cz = hx * f[0] + hy * f[1] + hz * f[2];
        if (cz < -0.3) continue;
        const q = (2 / (1 + cz)) * S;
        const x = (v.cx + (hx * r[0] + hy * r[1] + hz * r[2]) * q) | 0;
        const y = (v.cy - (hx * u[0] + hy * u[1] + hz * u[2]) * q) | 0;
        if (x < 0 || y < 0 || x >= W || y >= H || mask[y * W + x]) continue;
        buf[y * W + x] = this.starInk(mag, SBV[i], lim);
        if (mag < 1.1 && lim > 1.8) {
          const arm = mag < 0.3 ? P.ice : P.landHi;
          this.put(x - 1, y, arm);
          this.put(x + 1, y, arm);
          this.put(x, y - 1, arm);
          this.put(x, y + 1, arm);
        }
      }
    // the planets, over the stars
    this.shown = [];
    for (const pl of sky.planets) {
      if (pl.h[2] < 0.01 || pl.mag > lim0 + 1.2) continue;
      const p = proj(v, pl.h);
      if (!p) continue;
      const x = p[0] | 0;
      const y = p[1] | 0;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || mask[y * W + x]) continue;
      this.put(x, y, pl.ink);
      if (PLANETS[pl.i] === "Saturn") {
        this.put(x - 1, y, P.landHi);
        this.put(x + 1, y, P.landHi);
      } else if (pl.mag < -1) {
        const arm = PLANETS[pl.i] === "Venus" ? P.iceHi : P.ice;
        this.put(x - 1, y, arm);
        this.put(x + 1, y, arm);
        this.put(x, y - 1, arm);
        this.put(x, y + 1, arm);
      }
      this.shown.push({ name: this.planetNames[pl.i] ?? PLANETS[pl.i].toUpperCase(), x, y });
    }
  }
  private paintMoonSun(v: View, sky: SkyAt) {
    const { W, H, base: buf, mask } = this;
    const dark = darkness(sky.sunAlt);
    if (sky.sunAlt > -1.5) {
      const p = proj(v, sky.sunH);
      if (p) {
        const r = this.o.sunR;
        for (let dy = -6; dy <= 6; dy++)
          for (let dx = -6; dx <= 6; dx++) {
            const x = (p[0] | 0) + dx;
            const y = (p[1] | 0) + dy;
            if (x < 0 || y < 0 || x >= W || y >= H || mask[y * W + x]) continue;
            const d = Math.hypot(dx, dy);
            if (d <= r) buf[y * W + x] = d < r - 1.2 ? P.lightHot : P.iceHi;
          }
      }
    }
    if (sky.moonAlt < -1.5) return;
    const p = proj(v, sky.moonH);
    if (!p) return;
    // a small globe at its real phase, lit from the sun's side, its seas where they belong
    const Rm = this.o.moonR;
    const Mc = sky.moonH;
    const S = sky.sunH;
    const pdot = dot(sky.pole, Mc);
    const N = norm([sky.pole[0] - pdot * Mc[0], sky.pole[1] - pdot * Mc[1], sky.pole[2] - pdot * Mc[2]]);
    const Wd = cross(Mc, N);
    const rd = dot(v.r, Mc);
    const rr = norm([v.r[0] - rd * Mc[0], v.r[1] - rd * Mc[1], v.r[2] - rd * Mc[2]]);
    const uu = cross(rr, Mc);
    const cx = Math.round(p[0]);
    const cy = Math.round(p[1]);
    for (let dy = -Rm; dy <= Rm; dy++)
      for (let dx = -Rm; dx <= Rm; dx++) {
        const nx = dx / (Rm + 0.4);
        const ny = -dy / (Rm + 0.4);
        const q = nx * nx + ny * ny;
        if (q > 1) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H || mask[y * W + x]) continue;
        const nz = Math.sqrt(1 - q);
        const n: Vec = [nx * rr[0] + ny * uu[0] - nz * Mc[0], nx * rr[1] + ny * uu[1] - nz * Mc[1], nx * rr[2] + ny * uu[2] - nz * Mc[2]];
        const l = dot(n, S);
        const b = b4(x, y);
        if (l > (b - 0.5) * 0.16) {
          const lat = Math.asin(clamp(dot(n, N), -1, 1)) / R;
          const lon = Math.atan2(dot(n, Wd), -dot(n, Mc)) / R;
          let sea = false;
          for (const s of LUNAR_SEAS) {
            const a = (lat - s[0]) / s[2];
            const c = (lon - s[1]) / s[3];
            if (a * a + c * c < 1 + (hash2(lat * 0.9, lon * 0.9) - 0.5) * 0.5) {
              sea = true;
              break;
            }
          }
          const rimDark = q > 0.82 && b < (q - 0.82) * 3;
          buf[y * W + x] = sea ? (l < 0.18 || rimDark ? P.landHi : P.ice) : l < 0.12 || rimDark ? P.ice : P.iceHi;
        } else if (dark > 0.4) {
          // earthshine on the night side of the disc
          buf[y * W + x] = b < 0.35 ? P.landNight2 : P.oceanLit;
        }
      }
  }
  /** the constellation figures as dotted lines (the globe's flights), their names in pixel capitals */
  private paintNames(buf: Uint32Array, st: { s: string; x: number; y: number } | null) {
    const { W, H, mask } = this;
    const v = this.view();
    const sky = skyAt(this.ms);
    const M = sky.M;
    const c = this.names;
    const night = darkness(sky.sunAlt) > 0.5;
    const lineInk = night ? P.landLo : P.iceHi;
    const nameInk = night ? P.landHi : P.iceHi;
    const keep = (x: number, y: number) => !mask[y * W + x] && b4(x, y) < c;
    let n = 0;
    const plot = (x: number, y: number) => {
      if (x >= 0 && y >= 0 && x < W && y < H && (n++ & 1) === 0 && keep(x, y)) buf[y * W + x] = lineInk;
    };
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      x0 |= 0;
      y0 |= 0;
      x1 |= 0;
      y1 |= 0;
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (let guard = 0; guard < 2000; guard++) {
        plot(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
    };
    // labels never sit on each other, on the stamp or on the roofs
    const taken: number[][] = st ? [[st.x - 2, st.y - 2, W, st.y + 7]] : [];
    const label = (name: string, x: number, y: number, ink: number) => {
      const r = [x - 2, y - 2, x + textW(name) + 2, y + 7];
      if (r[0] < 0 || r[1] < 0 || r[2] > W || r[3] > H - (this.o.fade ?? 0)) return;
      if (taken.some((t) => r[0] < t[2] && t[0] < r[2] && r[1] < t[3] && t[1] < r[3])) return;
      for (let yy = r[1]; yy < r[3]; yy += 2) for (let xx = r[0]; xx < r[2]; xx += 2) if (mask[yy * W + xx]) return;
      taken.push(r);
      drawText(buf, W, H, name, x, y, ink, keep);
    };
    if (this.o.north) {
      const p = proj(v, mv(M, POLARIS));
      if (p) label("POLARIS", (p[0] | 0) + 3, (p[1] | 0) - 2, nameInk);
    }
    for (const s of this.shown) label(s.name, s.x + 3, s.y - 2, P.light);
    const names: [string, number, number][] = [];
    for (const con of CONS) {
      for (const pts of con.lines) {
        let prev: [number, number] | null = null;
        for (const pt of pts) {
          const h = mv(M, pt);
          const p = h[2] > -0.05 ? proj(v, h) : null;
          if (p && prev && Math.abs(p[0] - prev[0]) < W && Math.abs(p[1] - prev[1]) < H) {
            // stop short of each star, as the globe's routes stop short of a city
            const ddx = p[0] - prev[0];
            const ddy = p[1] - prev[1];
            const L = Math.hypot(ddx, ddy);
            if (L > 4) line(prev[0] + (ddx / L) * 2, prev[1] + (ddy / L) * 2, p[0] - (ddx / L) * 2, p[1] - (ddy / L) * 2);
          }
          prev = p;
        }
      }
      const h = mv(M, con.at);
      if (h[2] < 0.06) continue;
      const p = proj(v, h);
      if (!p) continue;
      names.push([con.name, Math.round(p[0] - textW(con.name) / 2), Math.round(p[1] - 2)]);
    }
    for (const [name, x, y] of names) label(name, x, y, nameInk);
  }
}

/* ═════════ the long exposure: every star's path, from the first minute to where the reader is ═════════ */
/** the exposure advances in this many steps from the first line to the last */
export const STEPS = 240;
/** each minute of reading is this many minutes of sky */
export const SKY_MIN_PER_READ_MIN = 40;

export class Exposure {
  t0 = 0;
  span = 0;
  step = -1;
  private trail: Float32Array | null = null;
  private cls = new Uint8Array(0);
  private last = new Float32Array(NS * 2);
  private ok = new Uint8Array(NS);

  constructor(private sky: Sky) {}

  reset(t0: number, minutes: number) {
    this.t0 = t0;
    this.span = minutes * SKY_MIN_PER_READ_MIN * 60000;
    this.step = -1;
    this.trail = null;
  }
  at(s: number) {
    return this.t0 + (this.span * s) / STEPS;
  }
  /** add every star's path up to step `to` (from the start again when going back, or after the camera moved) */
  advance(to: number) {
    const sk = this.sky;
    const { W, H } = sk;
    if (!W) return;
    if (!this.trail || this.trail.length !== W * H || to < this.step) {
      this.trail = new Float32Array(W * H);
      this.cls = new Uint8Array(W * H);
      this.ok.fill(0);
      this.step = -1;
    }
    const v = sk.view();
    const { f, r, u, S } = v;
    for (let s = this.step + 1; s <= to; s++) {
      const sky = skyAt(this.at(s));
      const M = sky.M;
      const lim0 = limitOf(sky);
      for (let i = 0; i < NS; i++) {
        const mag = SMAG[i];
        if (mag > lim0) {
          this.ok[i] = 0;
          continue;
        }
        const e0 = SV[i * 3];
        const e1 = SV[i * 3 + 1];
        const e2 = SV[i * 3 + 2];
        const hz = M[6] * e0 + M[7] * e1 + M[8] * e2;
        if (hz < 0.01) {
          this.ok[i] = 0;
          continue;
        }
        const hx = M[0] * e0 + M[1] * e1 + M[2] * e2;
        const hy = M[3] * e0 + M[4] * e1 + M[5] * e2;
        const cz = hx * f[0] + hy * f[1] + hz * f[2];
        if (cz < -0.3) {
          this.ok[i] = 0;
          continue;
        }
        const q = (2 / (1 + cz)) * S;
        const px = v.cx + (hx * r[0] + hy * r[1] + hz * r[2]) * q;
        const py = v.cy - (hx * u[0] + hy * u[1] + hz * u[2]) * q;
        if (px < -8 || py < -8 || px > W + 8 || py > H + 8) {
          this.ok[i] = 0;
          continue;
        }
        // only the brighter stars leave a trail worth seeing; red giants leave amber ones
        if (this.ok[i])
          this.stroke(
            this.last[i * 2],
            this.last[i * 2 + 1],
            px,
            py,
            clamp((lim0 - 0.6 - mag) / 4.2, 0, 1) ** 1.3 * (mag < 1 ? 1.2 : 1),
            SBV[i] > 1.15 && mag < 3.2 ? 1 : 0,
          );
        this.last[i * 2] = px;
        this.last[i * 2 + 1] = py;
        this.ok[i] = 1;
      }
    }
    this.step = Math.max(this.step, to);
  }
  private stroke(x0: number, y0: number, x1: number, y1: number, I: number, c: number) {
    if (I <= 0.02 || !this.trail) return;
    const { W, H } = this.sky;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    for (let k = 1; k <= n; k++) {
      const x = (x0 + ((x1 - x0) * k) / n) | 0;
      const y = (y0 + ((y1 - y0) * k) / n) | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (I > this.trail[i]) {
        this.trail[i] = I;
        this.cls[i] = c;
      }
    }
  }
  /** lay the trails over the sky, under the stars */
  draw(buf: Uint32Array, mask: Uint8Array) {
    const T = this.trail;
    const { W, H } = this.sky;
    if (!T || T.length !== W * H) return;
    const C = this.cls;
    for (let y = 0, i = 0; y < H; y++)
      for (let x = 0; x < W; x++, i++) {
        const I = T[i];
        if (I <= 0 || mask[i]) continue;
        const lv = Math.floor(I * 4.4 + (b4(x, y) - 0.5) * 1.1);
        if (lv <= 0) continue;
        buf[i] = C[i] ? [A30, A45, A80, P.light][Math.min(3, lv - 1)] : [P.landLo, P.landHi, P.ice, P.iceHi][Math.min(3, lv - 1)];
      }
  }
}
