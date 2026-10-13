/**
 * The arrival, as one flight (Arrival.tsx runs it, in a worker when the
 * browser can). From space, the planet under today's real sun turns until
 * Toulouse faces you; the camera falls toward it and through the clouds
 * over it, layer after layer, gaps rushing past, the planet becoming the
 * city inside the thickest one; under them, Toulouse from two kilometres,
 * the descent gliding in down the Garonne, locked on the Pont Neuf. Over
 * the Pont Saint-Pierre it sinks into a last bank of low cloud lying on
 * the river, and comes out of it into the wallpaper's own scene, gliding
 * the last stretch up the river at water level, every pixel at its depth
 * so the quays stream past while the mountains hold still, coming to rest
 * where the wallpaper is painted from. The last frame is the Desktop's
 * wallpaper, pixel for pixel: the flight doesn't cut to the Desktop, it
 * lands in it.
 *
 * Pure and DOM-free: `createFlight(setup).draw(t, out)` paints the frame at
 * any time t (ms) into a W×H buffer of art pixels on the wallpaper's grid
 * (same cell, same rows), little-endian RGBA as Uint32.
 */

import { worldGrid } from "../../apps/atlas/geo";
import { INK, project, sunVector } from "../../apps/atlas/planet";
import { MAT, WATER, buildCity, cityFrame } from "../wallpaper/city";
import { lampsAt, relight, skyLight } from "../wallpaper/light";
import { CELL, CLOUDS, MAP, lightToulouse, paintToulouse } from "./toulouseMap";

type RGB = [number, number, number];

const HOME = { lat: 43.6, lon: 1.44 };

/** The timeline, in ms. */
export const T = {
  /** stars and the planet come up out of the dark */
  fade: 1000,
  /** Toulouse faces you */
  turned: 3200,
  /** the fall toward it begins */
  plunge: 3400,
  /** inside the thickest cloud: the planet becomes the city */
  city: 6000,
  /** the descent over the map levels off over the Pont Saint-Pierre */
  reveal: 8000,
  /** deep in the low cloud on the river: the map is gone, the wallpaper's scene is under it, the glide up the river begins */
  glide: 8500,
  /** (the city camera's last frame, under the cloud) */
  joined: 8500,
  /** the Desktop starts coming in, over the last of the glide */
  hand: 9700,
  /** the glide has come to rest on the wallpaper's own view (the canvas, fading, is a pixel off at most by then) */
  land: 10300,
  /** the Desktop is all there is */
  end: 10600,
} as const;

export type FlightSetup = {
  /** the wallpaper's grid, in art pixels */
  W: number;
  H: number;
  /** the instant the wallpaper is lit for (Date ms): everything is lit for it */
  now: number;
  /** today's weather: how many clouds drift close over the Pont Neuf */
  near: number;
};

const RAD = Math.PI / 180;
const c01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const logLerp = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t));

const ch = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const pack = (r: number, g: number, b: number) => ((255 << 24) | (ch(b) << 16) | (ch(g) << 8) | ch(r)) >>> 0;
const packRGB = (c: RGB, k = 1) => pack(c[0] * k, c[1] * k, c[2] * k);
const hex = (c: string): RGB => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** what a wallpaper pixel is, for the glide in */
const C_SKY = 0;
const C_FAR = 1;
const C_BRIDGE = 2;
const C_BANK = 3;
const C_WATER = 4;
const C_DOME = 5;
const bayer = (x: number, y: number) => BAYER[((y & 3) << 2) | (x & 3)];

function hash2(x: number, y: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** value noise that tiles every `p` lattice cells */
function vnoiseP(x: number, y: number, p: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % p) + p) % p;
  const y0 = ((yi % p) + p) % p;
  const x1 = (x0 + 1) % p;
  const y1 = (y0 + 1) % p;
  const a = hash2(x0, y0);
  const b = hash2(x1, y0);
  const c = hash2(x0, y1);
  const d = hash2(x1, y1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** a 256² tile of soft fractal noise, made once: the clouds sample it, magnified, instead of computing noise per frame */
const NT = 256;
function noiseTile() {
  const out = new Float32Array(NT * NT);
  for (let y = 0; y < NT; y++)
    for (let x = 0; x < NT; x++) {
      const u = x / NT;
      const v = y / NT;
      out[y * NT + x] = 0.52 * vnoiseP(u * 6, v * 6, 6) + 0.3 * vnoiseP(u * 12 + 3.1, v * 12 + 7.7, 12) + 0.18 * vnoiseP(u * 24 + 9.4, v * 24 + 1.9, 24);
    }
  return out;
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

/** a 0.5° cell of the world grid over 9 art pixels: as close as the planet goes */
const R_MAX = 9 / (0.5 * RAD);

/** One fall from orbit to the clouds (0–1 of the way, in log scale): drifting closer while the planet turns, then ever faster, never pausing between the two. */
const fall = (t: number) => {
  const u = c01(t / T.city);
  return 0.08 * u + 0.92 * Math.pow(u, 3.3);
};

/** The planet's camera and apparent radius (art pixels) at t, for the space and plunge phases. */
export function orbit(t: number, W: number, H: number) {
  const min = Math.min(W, H);
  const a = inOutCubic(c01(t / T.turned));
  const R0 = min * (W < H ? 0.33 : 0.25);
  return { lat: lerp(12, HOME.lat, a), lon: lerp(-74, HOME.lon, a), R: logLerp(R0, R_MAX, fall(t)) };
}

/* the city, in map cells (CELL metres each). The descent comes down the river to a few
   hundred metres up, 600 m short of the Pont Neuf, looking at it (lower,
   the map's cells would fill the screen); there it sinks into low cloud, and
   comes out of it into the wallpaper's own scene, painted from the Pont
   Saint-Pierre's deck 10 m over the water and 300 m short of the Pont Neuf,
   for the glide in. */
const Z0 = 2000 / CELL;
const HFOV = 42 * RAD;
/** how far the descent starts behind where it levels off; how far that is, and the wallpaper's viewpoint, short of the Pont Neuf */
const RUN = 440 / CELL;
const BACK = 600 / CELL;
const SHORT = 300 / CELL;
/** the turn the descent unwinds as it comes out of the clouds, banking onto the bridge */
const SPIN = 38 * RAD;
/** where the glide in starts: how far back from the wallpaper's viewpoint (in its distances to the Pont Neuf),
    how high (of the screen's height, at the bridge's depth) and how far down it looks (of the screen's height) */
const GLIDE_BACK = 0.3;
const GLIDE_UP = 0.06;
const GLIDE_TILT = -0.08;

/** The wallpaper's horizon row and vanishing point for its grid (city.ts, buildCity). */
function wallpaperView(W: number, H: number) {
  const wide = smooth(c01((W / H - 0.62) / (1.45 - 0.62)));
  return { hz: Math.round(H * lerp(0.74, 0.6, wide)), vx: W * lerp(0.4, 0.5, wide) };
}

/** The view's geometry on a grid: focal length (art pixels), half its height as an angle, and the wallpaper's pitch and yaw. */
function lens(W: number, H: number) {
  const { hz, vx } = wallpaperView(W, H);
  const f = W / 2 / Math.tan(HFOV / 2);
  return { f, hz, half: Math.atan(H / 2 / f), thetaF: Math.atan((hz - H / 2) / f), yaw: Math.atan((vx - W / 2) / f) };
}

/** How high the descent levels off: where looking at the bridge keeps the top of the view a few degrees under the wallpaper's frame (a tall phone's view reaches further, so it stays higher). */
function revealHeight(W: number, H: number) {
  const { half, thetaF } = lens(W, H);
  return Math.min(750 / CELL, Math.max(300 / CELL, BACK * Math.tan(2 * half + 8 * RAD - thetaF)));
}

/** Through the descent (0–1), how far along: already moving as it clears the clouds, coming to rest over the bridge. */
const travel = (s: number) => 1.4 * s + 0.2 * s * s - 0.6 * s * s * s;
/** ...and how far down (in log height): still falling as it clears the clouds, levelling off. */
const sink = (s: number) => s + s * s - s * s * s;

/** The city camera's height in cells at t. */
function zAt(t: number, W: number, H: number) {
  const zR = revealHeight(W, H);
  if (t < T.reveal) return logLerp(Z0, zR, sink(c01((t - T.city) / (T.reveal - T.city))));
  // a little lower still, sinking into the low cloud on the river
  return logLerp(zR, zR * 0.8, smooth(c01((t - T.reveal) / (T.joined - T.reveal))));
}

type CityRefs = { bx: number; by: number; riverX: (y: number) => number };

/**
 * The city camera at t: position (map cells, z up), heading (0 = south,
 * the wallpaper's), pitch, focal length. It comes in from the north down
 * the river, looking at the Pont Neuf the whole way, levels off over the
 * Pont Saint-Pierre and turns to the wallpaper's heading, so the river runs
 * up the screen the way it does in the scene it comes out into.
 */
export function cityCam(t: number, W: number, H: number, refs: CityRefs) {
  const { f, hz, thetaF, yaw } = lens(W, H);
  const yR = refs.by - BACK;
  const s = c01((t - T.city) / (T.reveal - T.city));
  const r = c01((t - T.reveal) / (T.joined - T.reveal));
  // still drifting on toward the bridge as it sinks into the cloud
  const y = lerp(yR - RUN, yR, travel(s)) + RUN * 0.12 * smooth(r);
  const x = refs.riverX(y);
  const z = zAt(t, W, H);
  const tx = refs.bx - x;
  const ty = refs.by + 1 - y;
  const look = -Math.atan2(z - 6 / CELL, Math.hypot(tx, ty));
  // it lifts its eyes a little toward the horizon and turns to the wallpaper's heading as it levels off
  const settle = smoother(c01((t - (T.reveal - 600)) / (T.joined - (T.reveal - 600))));
  const turn = smoother(c01((t - (T.reveal - 600)) / 1100));
  const yF = refs.by - SHORT;
  const psiF = Math.atan2(refs.bx - refs.riverX(yF), refs.by + 1 - yF) + yaw;
  return {
    x,
    y,
    z,
    psi: lerp(Math.atan2(tx, ty) + SPIN * (1 - outCubic(s)), psiF, turn),
    theta: lerp(look, thetaF, 0.3 * settle),
    f,
    hz,
  };
}

/** The wallpaper's own view (heading, pitch): the map's sky and the river's reflections are drawn as it sees them. */
function finalCam(W: number, H: number, refs: CityRefs) {
  const { thetaF, yaw } = lens(W, H);
  const yF = refs.by - SHORT;
  return { psi: Math.atan2(refs.bx - refs.riverX(yF), refs.by + 1 - yF) + yaw, theta: thetaF };
}

/* the clouds flown through: each layer passes the camera at its time. The
   first ones part around the fall (it aims at a gap), the thickest is
   passed right through at T.city (the planet becomes the city inside it),
   the last ones open on Toulouse. */
const LAYERS = [
  { at: T.city - 1080, thr: 0.55, gap: true, seed: 11 },
  { at: T.city - 540, thr: 0.5, gap: true, seed: 23 },
  { at: T.city, thr: 0.46, gap: false, seed: 37 },
  { at: T.city + 560, thr: 0.52, gap: true, seed: 41 },
  { at: T.city + 1060, thr: 0.6, gap: true, seed: 53 },
];
/** depth units per ms: a layer is `D_FAR` away 1.2 s before it is passed */
const APPROACH = 1 / 400;
const D_FAR = 3;
/** noise texels per art pixel at depth 1 */
const DECK_S = 0.55;

export function createFlight({ W, H, now, near }: FlightSetup) {
  const N = W * H;
  const cx = W / 2;
  const cy = H / 2;
  const L = skyLight(now);
  const sun = sunVector(new Date(now));
  const grid = worldGrid();

  /* ── the planet's inks ── */
  const ink = Object.fromEntries(Object.entries(INK).map(([k, v]) => [k, [packRGB(v as RGB), packRGB(v as RGB, 0.6)]])) as Record<keyof typeof INK, [number, number]>;
  const BG = pack(5, 6, 7);
  const ATMO: RGB = [62, 84, 178];

  /* ── stars: a fixed field, a little parallax as the planet turns and as we fall ── */
  const rnd = mulberry32(0x5ca1ab1e);
  const starInks = ["#ebe9e1", "#89b4a8", "#aea3c8"].map(hex);
  const stars = Array.from({ length: Math.round(N / 110) }, () => {
    const b = rnd();
    const c = starInks[Math.floor(rnd() * 3)];
    const k = 0.35 + 0.65 * b * b;
    return { x: rnd() * W, y: rnd() * H, c: packRGB(c, k), depth: 0.4 + rnd() * 0.6 };
  });

  /* ── the sky beyond the wallpaper's frame: its five stops, top to horizon ── */
  const SKY = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const f = (i / 255) * 4;
    const j = Math.min(3, Math.floor(f));
    const a = L.sky[j];
    const b = L.sky[j + 1];
    const k = f - j;
    SKY[i] = pack(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
  }
  const fogC = L.sky[4];
  const [cloudLit, cloudMid, cloudShade] = L.cloud.map((c) => c as RGB);

  /* ── the wallpaper itself, lit for the same instant, for the landing (no vignette: that comes with the Desktop) ── */
  const city = buildCity(W, H);
  city.vig.fill(0);
  const wall = new Uint32Array(N);
  relight(city, { ms: now, lamps: lampsAt(now, city) }, wall);
  // which of its pixels are sky (at infinity: they can be shown from anywhere, the city only from its own viewpoint)
  const wallSky = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    const c = city.idx[p];
    const m = (c >> 4) & 63;
    wallSky[p] = m === MAT.STAR || (!(c & WATER) && (m === MAT.SKY || m === MAT.CLOUD)) ? 1 : 0;
  }
  // what each of its pixels is, for the glide in: sky (at infinity), the far skyline, the river (a plane, its
  // depth by row), the bridge (one depth) or a quay (its depth by column). Every pixel is drawn by asking
  // which of those surfaces the camera sees there, nearest first, so the scene has parallax
  const geo = cityFrame(W, H);
  const { dome } = geo;
  const cls = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    const c = city.idx[p];
    const m = (c >> 4) & 63;
    const x = p % W;
    const y = (p / W) | 0;
    let k: number = C_BANK;
    // (a star keeps its brightness in the flag bits, the water one among them)
    if ((c & WATER && m !== MAT.STAR) || m === MAT.FARWATER) k = C_WATER;
    // the dome stands back from the quay's front: one depth of its own (its ribs and lantern with it)
    else if (
      (m === MAT.DRUM || m === MAT.COPPER || ((m === MAT.STONE || m === MAT.DARK || m === MAT.WINDOW) && Math.abs(x + 0.5 - dome.x) <= dome.r + 1)) &&
      y >= dome.top - 1 &&
      y < dome.base
    )
      k = C_DOME;
    else if (m === MAT.SKY || m === MAT.STAR || m === MAT.CLOUD || m === MAT.RANGE || m === MAT.SNOW) k = C_SKY;
    else if (m === MAT.FAR) k = C_FAR;
    else if (m === MAT.LEAF) k = C_BANK;
    else if (x >= geo.xa && x <= geo.xb) k = m === MAT.WINDOW ? C_FAR : C_BRIDGE;
    cls[p] = k;
  }
  // and its plain sky, row by row (the median, so the sun or the moon don't streak it): the sky behind its
  // city before the city rises into it, and the flight's sky past its frame, so the two meet without a seam
  const plate = new Uint32Array(city.hz);
  {
    let last = SKY[0];
    const row: number[] = [];
    const lum = (v: number) => (v & 255) * 2 + ((v >> 8) & 255) * 5 + ((v >> 16) & 255);
    for (let y = 0; y < city.hz; y++) {
      row.length = 0;
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (((city.idx[p] >> 4) & 63) === MAT.SKY && wallSky[p]) row.push(wall[p]);
      }
      if (row.length) {
        row.sort((a, b) => lum(a) - lum(b));
        last = row[row.length >> 1];
      }
      plate[y] = last;
    }
  }

  /* ── Toulouse: painted once, in the Desktop's light, with mip levels so the far ground never shimmers ── */
  const map = paintToulouse(near);
  const { lights, water } = lightToulouse(map, L);
  const LIGHT = [0, pack(232, 146, 74), pack(250, 204, 112), pack(243, 227, 192)];
  const refs: CityRefs = { bx: map.bridge.x, by: map.bridge.y, riverX: map.riverX };
  // from high up the lamps are part of the ground: each level averages them in, so the lit town glows
  const lit = new Uint32Array(map.ground.data.buffer.slice(0));
  for (let p = 0; p < MAP * MAP; p++) if (lights[p]) lit[p] = LIGHT[lights[p]];
  const mips: Uint32Array[] = [new Uint32Array(map.ground.data.buffer.slice(0))];
  for (let lv = 1; lv < 5; lv++) {
    const src = lv === 1 ? lit : mips[lv - 1];
    const sn = MAP >> (lv - 1);
    const dn = sn >> 1;
    const dst = new Uint32Array(dn * dn);
    for (let y = 0; y < dn; y++)
      for (let x = 0; x < dn; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let k = 0; k < 4; k++) {
          const v = src[(y * 2 + (k >> 1)) * sn + x * 2 + (k & 1)];
          r += v & 255;
          g += (v >> 8) & 255;
          b += (v >> 16) & 255;
        }
        dst[y * dn + x] = pack(r / 4, g / 4, b / 4);
      }
    mips.push(dst);
  }
  // the river's own two tones, lit (its body, and the brightest of its sparkle): up close it is drawn as
  // ripples in them, not as magnified cells
  const tone = (keep: (l: number) => boolean) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let p = 0; p < MAP * MAP; p++) {
      const v = mips[0][p];
      if (!water[p] || !keep((v & 255) + ((v >> 8) & 255))) continue;
      r += v & 255;
      g += (v >> 8) & 255;
      b += (v >> 16) & 255;
      n++;
    }
    return [r / (n || 1), g / (n || 1), b / (n || 1)];
  };
  let topL = 0;
  for (let p = 0; p < MAP * MAP; p++) if (water[p]) topL = Math.max(topL, (mips[0][p] & 255) + ((mips[0][p] >> 8) & 255));
  const [wr, wg, wb] = tone(() => true);
  const [hr, hg, hb] = tone((l) => l >= topL - 6);
  const cloudPx = new Uint32Array(map.clouds.data.buffer.slice(0));
  const cloudA = new Uint8Array(CLOUDS * CLOUDS);
  for (let i = 0; i < CLOUDS * CLOUDS; i++) {
    const v = cloudPx[i];
    // the cloud texture's bright pixels: the clouds themselves (their painted shadows are left out, the flight casts its own)
    cloudA[i] = (v & 255) + ((v >> 8) & 255) > 120 * Math.min(1, L.sunUp + 0.35) ? map.clouds.data[i * 4 + 3] : 0;
  }

  // MAP and CLOUDS are powers of two: mirrored tiling with a mask, no modulo (as locals: the hot loop reads them)
  const M = MAP;
  const M2 = 2 * MAP - 1;
  const CN = CLOUDS;
  const C2 = 2 * CLOUDS - 1;
  const mirror = (v: number) => {
    const m = v & M2;
    return m < M ? m : M2 - m;
  };
  const mirrorC = (v: number) => {
    const m = v & C2;
    return m < CN ? m : C2 - m;
  };

  const tile = noiseTile();
  // a layer's density: the tile and a finer copy of it (twice the frequency: it still tiles), baked into one,
  // so a near layer still has edges worth looking at for the price of one sample
  const dtile = new Float32Array(NT * NT);
  for (let y = 0; y < NT; y++) for (let x = 0; x < NT; x++) dtile[y * NT + x] = tile[y * NT + x] * 0.7 + tile[((y * 2 + 13) & (NT - 1)) * NT + ((x * 2 + 71) & (NT - 1))] * 0.3;
  /** a tile, bilinear, wrapping */
  const sample = (tile: Float32Array, x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const x0 = xi & (NT - 1);
    const y0 = yi & (NT - 1);
    const x1 = (x0 + 1) & (NT - 1);
    const y1 = (y0 + 1) & (NT - 1);
    const a = tile[y0 * NT + x0];
    const b = tile[y0 * NT + x1];
    const c = tile[y1 * NT + x0];
    const d = tile[y1 * NT + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const nAt = (x: number, y: number) => sample(tile, x, y);
  const density = (u: number, v: number) => sample(dtile, u, v);

  /* ── the cloud layers: each turned and placed so the fall goes through a gap, or into the thick of it ── */
  const layers = LAYERS.map((l) => {
    const r = mulberry32(l.seed);
    const a = r() * Math.PI * 2;
    let best = l.gap ? 9 : -9;
    let ox = 0;
    let oy = 0;
    for (let k = 0; k < 600; k++) {
      const u = r() * NT;
      const v = r() * NT;
      const n = density(u, v);
      if (l.gap ? n < best : n > best) {
        best = n;
        ox = u;
        oy = v;
      }
    }
    return { ...l, cos: Math.cos(a), sin: Math.sin(a), ox, oy, field: new Float32Array(Math.ceil(W / 2) * Math.ceil(H / 2)) };
  });
  /* the deck's light: by day the sky's own clouds; at night lifted by the moon, warmed underneath by the city */
  const night = L.stars;
  const mixRGB = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const deckLit = mixRGB(cloudLit, [112, 126, 142], night * 0.85);
  const deckMid = mixRGB(cloudMid, [64, 72, 88], night * 0.85);
  const deckShade = mixRGB(cloudShade, [30, 34, 44], night * 0.8);
  const deckWarm: RGB = [128, 88, 60];

  /* ───────────── space and the plunge ───────────── */
  /** `skip`: pixels a cloud hides this frame (left undrawn) */
  function drawSpace(t: number, out: Uint32Array, skip: Uint8Array | null) {
    const o = orbit(t, W, H);
    out.fill(BG);
    // the stars slide the other way as the planet turns, and stream outward as we fall
    const turn = (o.lon + 74) * 0.16;
    const fall = Math.pow(o.R / orbit(T.plunge, W, H).R, 0.22);
    for (const s of stars) {
      const k = 1 + (fall - 1) * s.depth;
      const x = Math.round(cx + (s.x - cx) * k - turn * s.depth);
      const y = Math.round(cy + (s.y - cy) * k);
      if (x >= 0 && y >= 0 && x < W && y < H) out[y * W + x] = s.c;
    }

    const R = o.R;
    const f0 = o.lat * RAD;
    const cf = Math.cos(f0);
    const sf = Math.sin(f0);
    const [s0, s1, s2] = sun;
    const cl0 = Math.cos(o.lon * RAD);
    const sl0 = Math.sin(o.lon * RAD);
    const cellDeg = 1 / (R * RAD);
    const gridHalf = Math.max(0.42, 0.6 * cellDeg);
    const bin = R < 260 ? 0.5 : R < 520 ? 0.25 : 0.125;
    const atmo = 2.4 / R;
    const qa = (1 + atmo) * (1 + atmo);
    // full resolution all the way in (a switch to half would show as a pop); what a cloud hides is skipped
    const x0 = Math.max(0, Math.floor(cx - R - 4));
    const x1 = Math.min(W - 1, Math.ceil(cx + R + 4));
    const y0 = Math.max(0, Math.floor(cy - R - 4));
    const y1 = Math.min(H - 1, Math.ceil(cy + R + 4));
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        if (skip && skip[j * W + i]) continue;
        const dx = i - cx;
        const dy = j - cy;
        const u = dx / R;
        const v = -dy / R;
        const q = u * u + v * v;
        const th = bayer(i, j);
        let col: number;
        if (q > 1) {
          if (q > qa) continue;
          // the atmosphere: a thin dithered band on the lit side only
          const s = Math.sqrt(q);
          const nx = u / s;
          const ny = v / s;
          const n = ny * cf;
          const lat = Math.asin(n);
          const lon = o.lon * RAD + Math.atan2(nx, -ny * sf);
          const light = Math.cos(lat) * Math.cos(lon) * s0 + Math.cos(lat) * Math.sin(lon) * s1 + n * s2;
          const a = (1 - (s - 1) / atmo) * c01((light + 0.1) * 3);
          if (th >= a * 0.75) continue;
          col = packRGB(ATMO, 0.5 + 0.5 * a);
        } else {
          const z = Math.sqrt(1 - q);
          const n = v * cf + z * sf;
          // the point in Earth's frame (no trig but the two angles the grid needs)
          const a = z * cf - v * sf;
          const ex = a * cl0 - u * sl0;
          const ey = a * sl0 + u * cl0;
          const lat = Math.asin(n > 1 ? 1 : n < -1 ? -1 : n) / RAD;
          const lon = Math.atan2(ey, ex) / RAD;
          // land: the 0.5° grid sampled bilinearly and dithered, so coasts stay fine when it is magnified
          const fr = (90 - lat) * 2 - 0.5;
          const fc = (lon + 180) * 2 - 0.5;
          let r0 = Math.floor(fr);
          const c0 = Math.floor(fc);
          const ar = fr - r0;
          const ac = fc - c0;
          let r1 = r0 + 1;
          if (r0 < 0) r0 = 0;
          if (r1 > 359) r1 = 359;
          if (r0 > 359) r0 = 359;
          const ca = ((c0 % 720) + 720) % 720;
          const cb = (ca + 1) % 720;
          const l = (grid[r0 * 720 + ca] * (1 - ac) + grid[r0 * 720 + cb] * ac) * (1 - ar) + (grid[r1 * 720 + ca] * (1 - ac) + grid[r1 * 720 + cb] * ac) * ar;
          const land = l > th;
          const light = ex * s0 + ey * s1 + n * s2;
          const day = (light + 0.07) / 0.14 > th;
          let name: keyof typeof INK;
          if (land) {
            if (day) {
              const level = Math.max(0, light) * 2.2;
              if (lat > 63 || lat < -60) name = level > th ? "iceHi" : "ice";
              else name = level > 1 ? (level - 1 > th ? "landHi" : "land") : level > th ? "land" : "landLo";
            } else {
              const h = hash2(Math.floor(lat / bin), Math.floor(lon / bin) + 7919);
              // denser where people live (Europe's latitudes), thin over deserts and the far north
              const dense = lat > 36 && lat < 62 ? 0.05 : lat > -40 && lat < 30 ? 0.018 : 0.012;
              name = h < dense && lat < 70 && lat > -50 ? (h < dense * 0.22 ? "lightHot" : "light") : th < 0.5 ? "landNight2" : "landNight";
            }
          } else {
            const onGrid = Math.abs(lat) < gridHalf || Math.abs(lon - Math.round(lon / 30) * 30) < gridHalf;
            if (day) {
              if (onGrid) name = "grid";
              else {
                const level = Math.max(0, light) * 1.7;
                name = level > 1 ? (level - 1 > th ? "oceanLit" : "ocean") : level > th ? "ocean" : "oceanDeep";
              }
            } else name = onGrid ? "gridNight" : th < 0.25 ? "oceanNight2" : "oceanNight";
          }
          const rim = q > 0.86 && th < (q - 0.86) * 7 ? 1 : 0;
          col = ink[name][rim];
        }
        out[j * W + i] = col;
      }
    }

    // a ring finds Toulouse as it comes round, and closes on it
    const show = smooth(c01((t - 1700) / 500)) * (1 - smooth(c01((t - 4300) / 500)));
    if (show > 0) {
      const p = project(HOME.lat, HOME.lon, R, { lat: o.lat, lon: o.lon, zoom: 1 });
      if (p.front) {
        const r = lerp(Math.max(10, Math.min(W, H) * 0.05), 4, smooth(c01((t - 2000) / 1400)));
        ring(out, cx + p.x, cy + p.y, r, show);
      }
    }
  }

  function ring(out: Uint32Array, x: number, y: number, r: number, a: number) {
    const n = Math.max(24, Math.ceil(r * 7));
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2;
      const px = Math.round(x + Math.cos(ang) * r);
      const py = Math.round(y + Math.sin(ang) * r);
      if (px < 0 || py < 0 || px >= W || py >= H || bayer(px, py) >= a) continue;
      out[py * W + px] = pack(248, 235, 227);
    }
  }

  /* ───────────── the clouds: layer after layer, flown through ───────────── */
  const W2 = Math.ceil(W / 2);
  const H2 = Math.ceil(H / 2);
  // the deck's tones, as scalars (no colour arrays per pixel: the fall must not stutter on garbage)
  const [sR, sG, sB] = deckShade;
  const [mR, mG, mB] = deckMid;
  const [lR, lG, lB] = deckLit;
  const [wR, wG, wB] = deckWarm;
  /** this frame's layers, nearest first, and how far each has faded in */
  const visible: typeof layers = [];
  const fades = new Float64Array(LAYERS.length);
  const vf: Float32Array[] = [];
  const vt: number[] = [];
  /** per pixel: which of them it shows (its index in `visible`), or -1; and, under a faint one, the next */
  const hit = new Int8Array(N);
  const hit2 = new Int8Array(N);
  /** per pixel: nothing under it shows (an opaque cloud): the ground there needn't be drawn */
  const hidden = new Uint8Array(N);
  let veil = 0;
  let clouded = false;

  /**
   * Each visible layer's density at half resolution (magnified as it nears:
   * perspective), then, per pixel, the nearest layer whose cloud (its edge
   * dithered) is there. Layers further than that are behind it; so is the
   * ground, unless the layer is still fading in from the distance.
   */
  function cloudsAt(t: number) {
    visible.length = 0;
    veil = 0;
    for (const l of layers) {
      const d = (l.at - t) * APPROACH;
      // (thick quickly as it closes in; clearing slower, so the city comes out of it rather than cutting in)
      if (!l.gap) veil = Math.max(veil, 1 - smooth(c01(d >= 0 ? (d - 0.05) / 0.3 : (-d - 0.05) / 0.95)));
      if (d > 0.02 && d < D_FAR) visible.push(l);
    }
    clouded = visible.length > 0;
    if (!clouded) return;
    visible.sort((a, b) => a.at - b.at);
    for (let k = 0; k < visible.length; k++) {
      const l = visible[k];
      const d = (l.at - t) * APPROACH;
      fades[k] = smooth(c01((D_FAR - d) / 0.9));
      const s = d * DECK_S;
      const ux = l.cos * s;
      const uy = l.sin * s;
      const f = l.field;
      for (let j = 0; j < H2; j++) {
        const oy = j * 2 - cy;
        for (let i = 0; i < W2; i++) {
          const ox = i * 2 - cx;
          f[j * W2 + i] = density(l.ox + ox * ux - oy * uy, l.oy + ox * uy + oy * ux);
        }
      }
    }
    // over the planet, only over it (not out in space beside it)
    const R2 = t < T.city ? orbit(t, W, H).R ** 2 : Infinity;
    const nv = visible.length;
    for (let k = 0; k < nv; k++) {
      vf[k] = visible[k].field;
      vt[k] = visible[k].thr;
    }
    for (let j = 0; j < H; j++) {
      const row = (j >> 1) * W2;
      const dy2 = (j - cy) * (j - cy);
      for (let i = 0; i < W; i++) {
        const p = j * W + i;
        let h = -1;
        let h2 = -1;
        if ((i - cx) * (i - cx) + dy2 <= R2) {
          const q = row + (i >> 1);
          const th = bayer(i, j);
          // (the edge dithered over 0.035 of density)
          const e = 0.035 * th;
          for (let k = 0; k < nv; k++) {
            if (vf[k][q] > vt[k] + e) {
              if (h < 0) {
                h = k;
                if (fades[k] >= 1) break;
              } else {
                h2 = k;
                break;
              }
            }
          }
        }
        hit[p] = h;
        hit2[p] = h2;
        hidden[p] = (h >= 0 && fades[h] >= 1) || (h2 >= 0 && fades[h2] >= 1) ? 1 : 0;
      }
    }
  }

  /** Shades the clouds over the ground: thin edges in shade, thick middles lit, the side toward the light catching it. */
  function shadeClouds(t: number, out: Uint32Array) {
    const glow = night > 0.2 ? night * 0.26 : 0;
    /** layer `h`'s colour at a pixel, over `under` while it is still faint */
    const shade = (h: number, i: number, j: number, q: number, upq: number, under: number) => {
      const l = visible[h];
      const f = l.field;
      const n = f[q];
      const th = bayer(i, j);
      const k = c01((n - l.thr) / 0.3);
      let r: number;
      let g: number;
      let b: number;
      if (k < 0.5) {
        const m = k * 2;
        r = sR + (mR - sR) * m;
        g = sG + (mG - sG) * m;
        b = sB + (mB - sB) * m;
      } else {
        const m = (k - 0.5) * 2;
        r = mR + (lR - mR) * m;
        g = mG + (lG - mG) * m;
        b = mB + (lB - mB) * m;
      }
      // the side facing the light (up and to the left) catches it; the far side falls into shade
      const lt = n - f[upq];
      if (lt > 0.003 && th < c01(lt * 50)) {
        r += (lR - r) * 0.6;
        g += (lG - g) * 0.6;
        b += (lB - b) * 0.6;
      } else if (lt < -0.005 && th < c01(-lt * 36)) {
        r += (sR - r) * 0.5;
        g += (sG - g) * 0.5;
        b += (sB - b) * 0.5;
      }
      // at night, over the city, the thin edges glow faintly with its light
      if (glow && k < 0.35 && l.at > T.city - 100) {
        const m = glow * (1 - k / 0.35);
        r += (wR - r) * m;
        g += (wG - g) * m;
        b += (wB - b) * m;
      }
      // far off, a layer is faint: blended over what's under it (a dither that sparse would read as specks),
      // and paler, the way distant cloud is
      const fade = fades[h];
      if (fade < 1) {
        const pale = (1 - fade) * 0.6;
        r += (lR - r) * pale;
        g += (lG - g) * pale;
        b += (lB - b) * pale;
        r = (under & 255) + (r - (under & 255)) * fade;
        g = ((under >> 8) & 255) + (g - ((under >> 8) & 255)) * fade;
        b = ((under >> 16) & 255) + (b - ((under >> 16) & 255)) * fade;
      }
      return pack(r, g, b);
    };
    if (clouded) {
      for (let j = 0; j < H; j++) {
        const row = (j >> 1) * W2;
        const up = j >= 2 ? row - W2 : row;
        for (let i = 0; i < W; i++) {
          const p = j * W + i;
          const h = hit[p];
          if (h < 0) continue;
          const q = row + (i >> 1);
          const upq = up + (i >= 2 ? (i >> 1) - 1 : i >> 1);
          // a faint layer shows the one behind it through itself, not the ground
          const h2 = hit2[p];
          const under = h2 >= 0 ? shade(h2, i, j, q, upq, out[p]) : out[p];
          out[p] = shade(h, i, j, q, upq, under);
        }
      }
    }
    // inside the thick one: nothing but cloud, for a moment
    if (veil > 0) {
      const vz = 0.3 / Math.exp((t - T.city) / 700);
      for (let j = 0; j < H; j++) {
        const fy = (j - cy) / H;
        for (let i = 0; i < W; i++) {
          const fx = (i - cx) / H;
          // a little brighter toward the middle, where it thins first
          const m = veil >= 0.995 ? 1 : veil * (0.86 + 0.14 * c01(1 - (fx * fx + fy * fy) * 3));
          const p = j * W + i;
          // billows rushing past (outward from the middle: we're falling through it), lit from above
          const n = density(37 + (i - cx) * vz, 91 + (j - cy) * vz);
          const k = c01(0.3 + (n - 0.5) * 1.6 + 0.12 * (1 - j / H) + 0.1 * (bayer(i, j) - 0.5));
          const r = mR + (lR - mR) * k;
          const g = mG + (lG - mG) * k;
          const b = mB + (lB - mB) * k;
          if (m >= 1) {
            out[p] = pack(r, g, b);
            continue;
          }
          const v = out[p];
          out[p] = pack((v & 255) + (r - (v & 255)) * m, ((v >> 8) & 255) + (g - ((v >> 8) & 255)) * m, ((v >> 16) & 255) + (b - ((v >> 16) & 255)) * m);
        }
      }
    }
  }

  /* ───────────── Toulouse: the glide in, and the landing in the wallpaper ───────────── */
  const fin = finalCam(W, H, refs);
  const ctF = Math.cos(fin.theta);
  const stF = Math.sin(fin.theta);
  const FxF = ctF * Math.sin(fin.psi);
  const FyF = ctF * Math.cos(fin.psi);
  const FzF = stF;
  const UxF = -stF * Math.sin(fin.psi);
  const UyF = -stF * Math.cos(fin.psi);
  const UzF = ctF;
  const RxF = -Math.cos(fin.psi);
  const RyF = Math.sin(fin.psi);
  /** how far past the wallpaper's frame it still shows, stretched from its edge, fading out */
  const EDGE = 0.14 * H;
  const fadeOut = (o: number) => (o <= 0 ? 1 : o >= EDGE ? 0 : 1 - smooth(o / EDGE));
  const tF = Math.tan(fin.theta);
  /** the flight's own sky for a direction's elevation (tan): the wallpaper's sky on the row it takes in its frame */
  const skyFor = (te: number, f: number) => {
    const y = (cy - f * ((te - tF) / (1 + te * tF))) | 0;
    return plate[y < 0 ? 0 : y >= plate.length ? plate.length - 1 : y];
  };

  function drawCity(t: number, out: Uint32Array, skip: Uint8Array | null) {
    const c = cityCam(t, W, H, refs);
    const hx = Math.sin(c.psi);
    const hy = Math.cos(c.psi);
    const ct = Math.cos(c.theta);
    const st = Math.sin(c.theta);
    const Fx = ct * hx;
    const Fy = ct * hy;
    const Fz = st;
    const Ux = -st * hx;
    const Uy = -st * hy;
    const Uz = ct;
    const Rx = -hy;
    const Ry = hx;
    const f = c.f;
    const inv = 1 / f;
    const Px = c.x;
    const Py = c.y;
    const Pz = c.z;
    // haze reaches further the higher we are (from up there the city is crisp; on the river the horizon melts)
    const fogD = 2600 / CELL + Pz * 2.2;
    const airHaze = Math.min(0.08, (Pz * CELL) / 32000);
    const hz = c.hz;
    // cloud shadows sweep the town by day (the clouds are above us now)
    const shade = L.sunUp * 0.3;
    const drift = t * 0.036;
    const starK = L.stars;
    const [fr, fg, fb] = fogC;
    const W1 = W - 1;
    const H1 = H - 1;
    // the wallpaper's frame is a homography of the screen: along a row its terms step linearly
    const sx0 = -cx * inv;
    const dzA = (Rx * FxF + Ry * FyF) * inv;
    const dXA = (Rx * RxF + Ry * RyF) * inv;
    const dYA = (Rx * UxF + Ry * UyF) * inv;
    for (let j = 0; j < H; j++) {
      const sy = (cy - j) * inv;
      const rx0 = Fx + Ux * sy;
      const ry0 = Fy + Uy * sy;
      const dz = Fz + Uz * sy;
      let o = j * W;
      const ground = dz < -1e-5;
      const tt = ground ? -Pz / dz : 0;
      // the sky is the wallpaper's own, wherever its frame reaches
      const needW = !ground;
      let zs = (rx0 + Rx * sx0) * FxF + (ry0 + Ry * sx0) * FyF + dz * FzF;
      let nX = (rx0 + Rx * sx0) * RxF + (ry0 + Ry * sx0) * RyF;
      let nY = (rx0 + Rx * sx0) * UxF + (ry0 + Ry * sx0) * UyF + dz * UzF;
      for (let i = 0; i < W; i++, o++, zs += dzA, nX += dXA, nY += dYA) {
        if (skip && skip[o]) continue;
        const sx = (i - cx) * inv;
        const dx = rx0 + Rx * sx;
        const dy = ry0 + Ry * sx;
        // where this direction falls in the wallpaper's frame (its view, from where it is painted)
        let wv = -1;
        let wk = 0;
        let wY = 0;
        let wsky = false;
        if (needW && zs > 1e-4) {
          const iz = f / zs;
          const X = cx + nX * iz;
          const Y = cy - nY * iz;
          const ox = X < 0 ? -X : X > W1 ? X - W1 : 0;
          const oy = Y < 0 ? -Y : Y > H1 ? Y - H1 : 0;
          const k = fadeOut(ox > oy ? ox : oy);
          if (k > 0) {
            // just past its edge, its own pixels mirrored back (the river carries on), thinning out
            const Xm = X < 0 ? -X : X > W1 ? 2 * W1 - X : X;
            const Ym = Y < 0 ? -Y : Y > H1 ? 2 * H1 - Y : Y;
            const p = (Ym < 0 ? 0 : Ym > H1 ? H1 : (Ym + 0.5) | 0) * W + (Xm < 0 ? 0 : Xm > W1 ? W1 : (Xm + 0.5) | 0);
            wv = wall[p];
            wsky = wallSky[p] === 1;
            wY = Y;
            wk = k;
          }
        }
        // the wallpaper's sky wherever it shows; its edge thins out pixel by pixel (dithered), so the
        // frame never reads as a frame
        if (wv >= 0 && wsky && bayer(i + 1, j + 2) < wk) {
          out[o] = wv;
          continue;
        }
        let r: number;
        let g: number;
        let b: number;
        if (ground) {
          const len2 = dx * dx + dy * dy + dz * dz;
          // one art pixel's footprint on the ground, stretched at grazing angles: picks the mip
          const fp = (tt * len2 * inv) / -dz;
          const lv = fp < 1.5 ? 0 : fp < 3 ? 1 : fp < 6 ? 2 : fp < 12 ? 3 : 4;
          const wx = Px + tt * dx;
          const wy = Py + tt * dy;
          // an ordered dither between neighbouring texels of the level, about an art pixel wide, so the far
          // ground never shimmers in blocks while up close every map pixel stays crisp
          const sp = lv ? 1 << lv : fp < 1 ? fp : 1;
          const gx = mirror(Math.floor(wx + (bayer(i, j) - 0.5) * sp)) >> lv;
          const gy = mirror(Math.floor(wy + (bayer(i + 2, j + 1) - 0.5) * sp)) >> lv;
          let v = mips[lv][gy * (M >> lv) + gx];
          // lamps: whole cells from high up, points of light as we come close (further off, the mips have them as a glow)
          const cell = mirror(Math.floor(wy)) * M + mirror(Math.floor(wx));
          const lamp = lights[cell];
          if (lamp && lv === 0) {
            // sized by the footprint across the view, not along it: at a grazing angle a lamp stays a point, not a bar
            const half = Math.max(0.09, 0.75 * tt * Math.sqrt(len2) * inv);
            const fx = wx - Math.floor(wx) - 0.5;
            const fy = wy - Math.floor(wy) - 0.5;
            if (half >= 0.5 || (fx > -half && fx < half && fy > -half && fy < half)) v = LIGHT[lamp];
          }
          r = v & 255;
          g = (v >> 8) & 255;
          b = (v >> 16) & 255;
          if (water[cell]) {
            // close over the water: ripples across the current, drifting downstream, in the river's two tones
            if (fp < 0.6 && !lamp) {
              const k = c01((0.6 - fp) / 0.4);
              const n = nAt(wx * 0.55, wy * 1.7 + t * 0.0016);
              const hi = bayer(i, j) < c01((n - 0.52) / 0.12);
              r += ((hi ? hr : wr) - r) * k;
              g += ((hi ? hg : wg) - g) * k;
              b += ((hi ? hb : wb) - b) * k;
            }
            // the river mirrors the sky, the more the flatter we look across it: the wallpaper's sky where it can
            const graze = 1 - c01((-dz / Math.sqrt(len2)) * 2.6);
            if (graze > 0) {
              let sv = 0;
              const zr = dx * FxF + dy * FyF - dz * FzF;
              if (zr > 1e-4) {
                const X = cx + (f * (dx * RxF + dy * RyF)) / zr;
                const Y = cy - (f * (dx * UxF + dy * UyF - dz * UzF)) / zr;
                if (X >= 0 && X <= W1 && Y >= 0 && Y <= H1) {
                  const p = ((Y + 0.5) | 0) * W + ((X + 0.5) | 0);
                  if (wallSky[p]) sv = wall[p];
                }
              }
              if (!sv) sv = skyFor(-dz / Math.sqrt(dx * dx + dy * dy), f);
              const mm = graze * graze * 0.62;
              r += ((sv & 255) - r) * mm;
              g += (((sv >> 8) & 255) - g) * mm;
              b += (((sv >> 16) & 255) - b) * mm;
            }
          } else if (fp < 0.3) {
            // and finer still: grain inside a cell (stone, roofs), fading in as we come down, and out
            // again before its specks grow into blocks of their own
            const d = (hash2(Math.floor(wx * 2.5), Math.floor(wy * 2.5)) - 0.5) * 0.22 * c01((0.3 - fp) / 0.2) * c01((6 - 0.2 / fp) / 3);
            r *= 1 + d;
            g *= 1 + d;
            b *= 1 + d;
          }
          // a cloud's shadow passing over (dithered between its texels: up close they would be blocks)
          if (shade > 0) {
            // (the cloud layer is coarser: 10 m to its pixel)
            const ca = cloudA[mirrorC(Math.floor(wy / 3.6 - 4 + bayer(i + 1, j + 3))) * CN + mirrorC(Math.floor(wx / 3.6 + drift - 5 + bayer(i + 3, j)))];
            if (ca > 0) {
              const k = 1 - (ca / 255) * shade;
              r *= k;
              g *= k;
              b *= k;
            }
          }
          // distance across the land hazes into the horizon's colour, as on the wallpaper
          // (straight down stays clear; a little air haze with height)
          const d = (tt * Math.sqrt(dx * dx + dy * dy)) / fogD;
          const fog = Math.min(1, 1 - 1 / (1 + d + d * d * 0.5) + airHaze);
          r += (fr - r) * fog;
          g += (fg - g) * fog;
          b += (fb - b) * fog;
        } else {
          // the sky past the wallpaper's frame: its colours by the row they take there, and stars fixed to directions
          const hz2 = Math.sqrt(dx * dx + dy * dy);
          const te = dz / hz2;
          let v = skyFor(te, f);
          if (starK > 0.05 && te > 0.02) {
            const h = hash2(Math.floor((dx / hz2) * 420) + (dy < 0 ? 77777 : 0), Math.floor(te * 420) + 99991);
            if (h < 0.011 * starK) v = packRGB(starInks[(h * 1e4) % 3 | 0], 0.4 + 0.6 * ((h * 97) % 1));
          }
          r = v & 255;
          g = (v >> 8) & 255;
          b = (v >> 16) & 255;
          // where the wallpaper's city will stand: its own sky, until the city rises into it
          if (wv >= 0 && !wsky && wY < hz) {
            const pv = plate[wY | 0];
            r += ((pv & 255) - r) * wk;
            g += (((pv >> 8) & 255) - g) * wk;
            b += (((pv >> 16) & 255) - b) * wk;
          }
        }
        out[o] = pack(r, g, b);
      }
    }
  }

  /* ───────────── the glide in: the wallpaper's own scene, in depth ───────────── */
  // From T.glide the camera is down on the river, a few hundred metres short of the wallpaper's viewpoint
  // and a little above it, looking a little down; it glides up the river onto the deck, coming to rest on
  // the wallpaper's exact view at T.land. The scene is the wallpaper's, its pixels at their depths: the
  // quays at theirs (by column), the river a plane (by row), the bridge at one, the far skyline further,
  // the sky at infinity. So the quays stream past and the bridge grows while the mountains hold still.
  const { vx, xa, xb, hz: hzW, Lf } = geo;
  const aW = Math.max(1, Lf - hzW);
  const FAR_F = 0.12;
  /** the deep water's bottom rows, repeated where the glide sees water nearer than the wallpaper does */
  const DEEP_ROWS = Math.max(4, Math.round(H * 0.06));
  const H1g = H - 1;
  const DOME_F = dome.f;
  /** a column past the frame's edge, folded back into it (continuous: pixel i spans [i, i + 1)) */
  const mirX = (x: number) => (x < 0 ? -x : x >= W ? 2 * W - x - 1e-6 : x);

  /** the glide's camera at t: how far back (in bridge distances), how high (art px at the bridge's depth), how far it looks down (px) */
  function glideAt(t: number) {
    const e = 1 - Math.pow(1 - c01((t - T.glide) / (T.land - T.glide)), 2.4);
    return { back: GLIDE_BACK * (1 - e), up: GLIDE_UP * H * (1 - e), tilt: GLIDE_TILT * H * (1 - e) };
  }

  function drawGlide(t: number, out: Uint32Array) {
    const { back, up, tilt } = glideAt(t);
    const kB = 1 + back;
    const kF = 1 + back * FAR_F;
    const kD = 1 + back * DOME_F;
    const lastPlate = plate[plate.length - 1];
    for (let j = 0; j < H; j++) {
      const Yc = j + 0.5;
      // this row, measured from the wallpaper's horizon as it would stand without the tilt
      const Yp = Yc - tilt - hzW;
      // the river: the plane's depth on this row, and the row it comes from
      let fW = -1;
      let pW = -1;
      if (Yp > 0) {
        const den = aW + up - back * Yp;
        fW = den > 1e-3 ? Yp / den : 1e4;
        const ys = hzW + aW * fW;
        // nearer than the wallpaper's own bottom row (behind its viewpoint): the deep water's last rows, repeated
        pW = (ys > H1g ? H1g - (((ys - H1g) | 0) % DEEP_ROWS) : ys | 0) * W;
      }
      const yB = hzW + Yp * kB - up;
      const rowB = yB >= 0 && yB < H ? (yB | 0) * W : -1;
      const yF = hzW + Yp * kF - up * FAR_F;
      const yD = hzW + Yp * kD - up * DOME_F;
      const rowD = yD >= 0 && yD < H ? (yD | 0) * W : -1;
      const rowF = yF >= 0 && yF < H ? (yF | 0) * W : -1;
      const ySky = Yc - tilt;
      const jSky = ySky < 0 ? 0 : ySky > H1g ? H1g : ySky | 0;
      let o = j * W;
      for (let i = 0; i < W; i++, o++) {
        const Xc = i + 0.5;
        let best = -1;
        let bv = 0;
        // a quay: its depth from the column it stands in
        const left = Xc < vx;
        const u = left ? (vx - Xc) / (vx - xa) : (Xc - vx) / (xb - vx);
        const dq = 1 - back * u;
        if (u > 0 && dq > 0.05) {
          const f = u / dq;
          const xs = mirX(left ? vx - (vx - xa) * f : vx + (xb - vx) * f);
          const ys = hzW + Yp * (1 + back * f) - up * f;
          if (ys >= 0 && ys < H) {
            const p = (ys | 0) * W + (xs | 0);
            if (cls[p] === C_BANK) {
              best = f;
              bv = wall[p];
            }
          }
        }
        // the dome, set back from its quay
        if (best < DOME_F && rowD >= 0) {
          const xs = vx + (Xc - vx) * kD;
          if (xs >= 0 && xs < W) {
            const p = rowD + (xs | 0);
            if (cls[p] === C_DOME) {
              best = DOME_F;
              bv = wall[p];
            }
          }
        }
        // the river, where it comes nearer than any quay here
        if (fW > best) {
          const p = pW + (mirX(vx + (Xc - vx) * (1 + back * fW)) | 0);
          if (cls[p] === C_WATER) {
            best = fW;
            bv = wall[p];
          }
        }
        // the bridge
        if (best < 1 && rowB >= 0) {
          const xs = vx + (Xc - vx) * kB;
          if (xs >= 0 && xs < W) {
            const p = rowB + (xs | 0);
            if (cls[p] === C_BRIDGE) {
              best = 1;
              bv = wall[p];
            }
          }
        }
        // the far skyline
        if (best < FAR_F && rowF >= 0) {
          const xs = vx + (Xc - vx) * kF;
          if (xs >= 0 && xs < W) {
            const p = rowF + (xs | 0);
            if (cls[p] === C_FAR) {
              best = FAR_F;
              bv = wall[p];
            }
          }
        }
        // the sky, at infinity: only the tilt moves it (where something nearer used to stand, its plain sky)
        if (best < 0) {
          const p = jSky * W + i;
          bv = cls[p] === C_SKY ? wall[p] : jSky < plate.length ? plate[jSky] : lastPlate;
          best = 0;
        }
        out[o] = bv;
      }
    }
  }

  /* ───────────── the low cloud on the river: the map goes into it, the wallpaper's scene comes out ───────────── */
  /** how far it has closed over the view (0–1) and how far it has opened again, from the middle out */
  const bankAt = (t: number) => ({
    rise: smooth(c01((t - (T.glide - 640)) / 560)),
    // it gives way at once in the middle, then thins out toward the edges, slower
    clear: 1 - Math.pow(1 - c01((t - T.glide) / 950), 2.2),
  });
  /** where it opens from, and the scale its billows rush past at: toward the bridge the glide is headed for */
  const bankX = vx;
  const bankY = hzW - H * 0.04;
  const bankR = 1 / Math.hypot(W, H) / 0.55;
  /** this frame, at half resolution (its billows are soft and large: the layers' trick): how thick it is, how far it has closed */
  const bankN = new Float32Array(W2 * H2);
  const bankA = new Float32Array(W2 * H2);
  const bankT = new Float32Array(W2 * H2);
  /** its tones, from its shaded rims to its lit tops (64 steps), and each caught by the light or turned from it */
  const bankTone = (k: number, toward: RGB | null, m: number) => {
    let r: number;
    let g: number;
    let b: number;
    if (k < 0.5) {
      r = sR + (mR - sR) * k * 2;
      g = sG + (mG - sG) * k * 2;
      b = sB + (mB - sB) * k * 2;
    } else {
      r = mR + (lR - mR) * (k - 0.5) * 2;
      g = mG + (lG - mG) * (k - 0.5) * 2;
      b = mB + (lB - mB) * (k - 0.5) * 2;
    }
    if (toward) {
      r += (toward[0] - r) * m;
      g += (toward[1] - g) * m;
      b += (toward[2] - b) * m;
    }
    return pack(r, g, b);
  };
  const BANK_BASE = Uint32Array.from({ length: 64 }, (_, i) => bankTone(i / 63, null, 0));
  const BANK_LIT = Uint32Array.from({ length: 64 }, (_, i) => bankTone(i / 63, deckLit, 0.55));
  const BANK_SHADE = Uint32Array.from({ length: 64 }, (_, i) => bankTone(i / 63, deckShade, 0.25));

  /**
   * The bank: billows in the deck's light, rushing outward from where
   * the camera is headed (it is flying into them), closing over the town
   * as it sinks in and opening from the middle as it comes out over the
   * river, their edges dithered like every cloud on the way down. Deep
   * in it, nothing but its own soft relief, lighter overhead.
   */
  function drawBank(t: number, b: { rise: number; clear: number }, out: Uint32Array) {
    const z = 0.42 / Math.exp((t - T.glide) / 1000);
    for (let j = 0; j < H2; j++) {
      // (lying on the water, it lingers longest close by, under the camera)
      const y = j * 2 - bankY;
      const dy = y > 0 ? y * 1.9 : y;
      for (let i = 0; i < W2; i++) {
        const q = j * W2 + i;
        const dx = i * 2 - bankX;
        // closing evenly, opening from the middle out
        const a = b.rise * c01(1 - b.clear * 2.1 + Math.sqrt(dx * dx + dy * dy) * bankR * 0.9);
        bankA[q] = a;
        if (a <= 0) continue;
        bankN[q] = density(141 + dx * z, 63 + y * z);
        bankT[q] = 0.86 - a * Math.sqrt(a) * 0.74;
      }
    }
    for (let j = 0; j < H; j++) {
      const row = (j >> 1) * W2;
      const upRow = j >= 2 ? row - W2 : row;
      const sky = 0.35 + 0.12 * (1 - j / H);
      let o = j * W;
      for (let i = 0; i < W; i++, o++) {
        const q = row + (i >> 1);
        const a = bankA[q];
        if (a <= 0) continue;
        const n = bankN[q];
        const thr = bankT[q] + 0.05 * (bayer(i, j) - 0.5);
        if (n <= thr) continue;
        // at its edges a cloud's own light (its rims lit, never a grey ring); deep in, its billows
        const e = c01((n - thr) / 0.3);
        const k = 0.35 + 0.65 * (e + (c01(sky + (n - 0.5) * 1.5) - e) * a);
        const tone = (k * 63) | 0;
        // the side toward the light (up, to the left) catches it, the far side falls into shade
        const up = bankA[upRow + (i >= 2 ? (i >> 1) - 1 : 0)] > 0 ? bankN[upRow + (i >= 2 ? (i >> 1) - 1 : 0)] : n;
        const lt = (n - up) * (1 - a * 0.6);
        const th = bayer(i + 2, j + 3);
        out[o] = lt > 0.004 && th < lt * 40 ? BANK_LIT[tone] : lt < -0.006 && th < -lt * 30 ? BANK_SHADE[tone] : BANK_BASE[tone];
      }
    }
  }

  function draw(t: number, out: Uint32Array) {
    cloudsAt(t);
    const b = bankAt(t);
    // deep in the thick one, or in the low cloud on the river, there is nothing else to see
    if (veil < 0.995 && !(b.rise >= 1 && b.clear <= 0)) {
      if (t >= T.glide) drawGlide(t, out);
      else {
        const skip = clouded ? hidden : null;
        if (t < T.city) drawSpace(t, out, skip);
        else drawCity(t, out, skip);
      }
    }
    shadeClouds(t, out);
    if (b.rise > 0 && b.clear < 1) drawBank(t, b, out);
    // up out of the dark
    if (t < T.fade) {
      const k = smooth(c01(t / T.fade));
      for (let i = 0; i < N; i++) {
        const v = out[i];
        out[i] = pack((v & 255) * k, ((v >> 8) & 255) * k, ((v >> 16) & 255) * k);
      }
    }
  }

  // each phase drawn once now, so the engine has compiled it before the flight needs it (no hitch at a hand-over)
  {
    const scratch = new Uint32Array(N);
    for (const t of [T.plunge + 900, T.city - 300, T.city + 400, T.city + 1500, T.glide - 300, T.glide + 400, T.hand, T.end]) draw(t, scratch);
  }

  return { draw, refs };
}
