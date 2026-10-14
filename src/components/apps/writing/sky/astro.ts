/**
 * The sky over Toulouse at any minute, for the Blog's pictures: where the
 * stars, the Milky Way, the moon, the sun and four planets were, how dark
 * it was, and the inks to paint them in (the Atlas globe's, one canvas
 * cell per art pixel, Bayer dither). The flat band (./render) and the dome
 * (./dome) both paint from here.
 *
 * Positions are low precision on purpose (a few arcminutes for the sun
 * and planets, a fraction of a degree for the moon): at 3 px a cell, a
 * cell is about a quarter of a degree.
 */

import { PIXEL_FOLD, PIXEL_GLYPHS } from "@/components/PixelLabel";
import { TOULOUSE } from "@/lib/sun";
import { FIGURES, MILKY_WAY, NAMES, POLARIS as POLARIS_AT, STARS, STAR_COUNT } from "./catalog";

export type RGB = [number, number, number];
export type Vec = [number, number, number];

export const R = Math.PI / 180;
const LAT = TOULOUSE.lat;
const LON = TOULOUSE.lon;

/* ───── the Atlas inks (src/components/apps/atlas/ink.ts) ───── */
export const INK = {
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
export type InkName = keyof typeof INK;

/** RGBA packed for a little-endian Uint32 view of ImageData */
export const pack = ([r, g, b]: RGB, k = 1) =>
  ((255 << 24) | (Math.min(255, Math.round(b * k)) << 16) | (Math.min(255, Math.round(g * k)) << 8) | Math.min(255, Math.round(r * k))) >>> 0;
export const P = Object.fromEntries(Object.entries(INK).map(([k, v]) => [k, pack(v as RGB)])) as Record<InkName, number>;
export const amber = (k: number) => pack(INK.light, k);
export const A30 = amber(0.3);
export const A45 = amber(0.45);
export const A60 = amber(0.6);
export const A80 = amber(0.8);
/** the sky, dark to light: night indigo up through the globe's lit land to ice */
export const SKY = (["oceanNight", "oceanNight2", "oceanDeep", "ocean", "oceanLit", "landNight2", "landLo", "land", "landHi", "ice", "iceHi", "lightHot"] as const).map((k) => P[k]);
/** the dusk, low over the sun: amber from embers to glare */
export const WARM = [amber(0.36), amber(0.56), amber(0.76), P.light, pack([250, 213, 170])];

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const b4 = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const sstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export function hash2(a: number, b: number) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function rng(seed: number) {
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
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const mv = (M: number[], e: Vec): Vec => [
  M[0] * e[0] + M[1] * e[1] + M[2] * e[2],
  M[3] * e[0] + M[4] * e[1] + M[5] * e[2],
  M[6] * e[0] + M[7] * e[1] + M[8] * e[2],
];
export const eqVec = (ra: number, dec: number): Vec => [Math.cos(dec * R) * Math.cos(ra * R), Math.cos(dec * R) * Math.sin(ra * R), Math.sin(dec * R)];
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
export function drawText(buf: Uint32Array, W: number, H: number, s: string, x: number, y: number, col: number, keep?: (x: number, y: number) => boolean) {
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
export const NS = STAR_COUNT;
/** each star's direction (equatorial unit vector), magnitude and B−V colour, faintest first */
export const SV = new Float32Array(NS * 3);
export const SMAG = new Float32Array(NS);
export const SBV = new Float32Array(NS);
{
  const d = view64(STARS);
  for (let i = 0; i < NS; i++) {
    SV.set(eqVec(d.getInt16(i * 6, true) / 10, d.getInt16(i * 6 + 2, true) / 10), i * 3);
    SMAG[i] = d.getInt8(i * 6 + 4) / 10;
    SBV[i] = d.getInt8(i * 6 + 5) / 10;
  }
}
export type Figure = { name: string; at: Vec; lines: Vec[][] };
export const CONS: Figure[] = (() => {
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
export const POLARIS = eqVec(POLARIS_AT[0], POLARIS_AT[1]);
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
export function mwAt(ra: number, dec: number) {
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
export const PLANETS = ["Venus", "Mars", "Jupiter", "Saturn"] as const;
export const PLANET_INK: Record<(typeof PLANETS)[number], InkName> = { Venus: "lightHot", Mars: "light", Jupiter: "iceHi", Saturn: "ice" };

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
export const limitOf = (sky: SkyAt) => limitMag(sky.sunAlt) - (sky.moonAlt > 0 ? sky.moonK * 0.9 * darkness(sky.sunAlt) : 0);

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
export function paris(ms: number) {
  const o: Record<string, string> = {};
  for (const p of PARIS.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}
/** a film camera's date stamp: 'YY MM DD HH:MM (no year when it's narrow) */
export const stampOf = (ms: number, short: boolean) => {
  const o = paris(ms);
  return `${short ? "" : `'${o.year} `}${o.month} ${o.day} ${o.hour}:${o.minute}`;
};
/** HH:MM in Toulouse */
export const clockOf = (ms: number) => {
  const o = paris(ms);
  return `${o.hour}:${o.minute}`;
};
/** the share of windows still lit at that local hour */
export function litShare(ms: number, sunAlt: number) {
  if (sunAlt > 2) return 0;
  const o = paris(ms);
  const h = +o.hour + +o.minute / 60;
  if (h >= 17 && h < 22) return 0.36;
  if (h >= 22) return 0.36 - (h - 22) * 0.07;
  if (h < 1) return 0.22 - h * 0.06;
  if (h < 5) return Math.max(0.05, 0.16 - (h - 1) * 0.03);
  return 0.12;
}

/** where the landmarks stand round the Capitole (azimuth, degrees): Saint-Sernin, Saint-Étienne, La Grave */
export const LANDMARKS = [2, 128, 262];

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

/* ───── painting it: the same inks for the flat band and the dome ───── */

/** the moon's seas: latitude, longitude, and the half-axes of each, in degrees */
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

/**
 * The sky's ink in any direction (horizon x east, y north, z up) at one
 * moment: the night's indigo up through the day's lilac, the glow round
 * the sun and the moon, the Milky Way and its dust when it's dark enough,
 * the dusk's amber low over the sun. Worked out once per moment; call the
 * function it returns for each cell.
 */
export function skyShader(sky: SkyAt) {
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
  const sunGlow = sky.sunAlt > -8 ? 1 - dark : 0;
  return (hx: number, hy: number, hz: number, x: number, y: number) => {
    const alt = Math.asin(hz > 1 ? 1 : hz < -1 ? -1 : hz) / R;
    const b = b4(x, y);
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
    if (warm > 0.08 + b * 0.9) return WARM[clamp((warm * 4.2 + b - 0.6) | 0, 0, 4)];
    if (dust) return val < 2.6 ? P.landNight2 : P.landLo;
    return SKY[clamp(Math.floor(val + b - 0.5), 0, 11)];
  };
}

/** a star's ink by its brightness (a step dimmer at the edge of seeing); red giants go amber */
export function starInk(mag: number, bv: number, lim: number) {
  let c = mag < 0.6 ? 5 : mag < 1.6 ? 4 : mag < 2.6 ? 3 : mag < 3.6 ? 2 : mag < 4.4 ? 1 : 0;
  if (lim - mag < 0.7) c = Math.max(0, c - 1);
  if (bv > 1.15 && mag < 3.2) return c >= 4 ? P.light : c >= 2 ? A80 : A60;
  return [P.landLo, P.land, P.landHi, P.ice, P.iceHi, P.lightHot][c];
}

/**
 * The moon as a small globe at its real phase, lit from the sun's side,
 * its seas where they belong, centred on cell (cx, cy) with radius Rm.
 * `right` is the screen's right in horizon coordinates; `put` sets a cell
 * (and decides whether it may).
 */
export function paintMoon(sky: SkyAt, cx: number, cy: number, Rm: number, right: Vec, put: (x: number, y: number, c: number) => void) {
  const dark = darkness(sky.sunAlt);
  const Mc = sky.moonH;
  const S = sky.sunH;
  const pdot = dot(sky.pole, Mc);
  const N = norm([sky.pole[0] - pdot * Mc[0], sky.pole[1] - pdot * Mc[1], sky.pole[2] - pdot * Mc[2]]);
  const Wd = cross(Mc, N);
  const rd = dot(right, Mc);
  const rr = norm([right[0] - rd * Mc[0], right[1] - rd * Mc[1], right[2] - rd * Mc[2]]);
  const uu = cross(rr, Mc);
  for (let dy = -Rm; dy <= Rm; dy++)
    for (let dx = -Rm; dx <= Rm; dx++) {
      const nx = dx / (Rm + 0.4);
      const ny = -dy / (Rm + 0.4);
      const q = nx * nx + ny * ny;
      if (q > 1) continue;
      const x = cx + dx;
      const y = cy + dy;
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
        put(x, y, sea ? (l < 0.18 || rimDark ? P.landHi : P.ice) : l < 0.12 || rimDark ? P.ice : P.iceHi);
      } else if (dark > 0.4) {
        // earthshine on the night side of the disc
        put(x, y, b < 0.35 ? P.landNight2 : P.oceanLit);
      }
    }
}
