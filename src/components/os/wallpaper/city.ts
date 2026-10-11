/**
 * emOS wallpaper, the scene: Toulouse from the Pont Saint-Pierre, looking
 * upstream (south). The brick quays of La Daurade on the left, the
 * verdigris Dôme de la Grave on the Saint-Cyprien bank on the right, the
 * seven unequal arches of the Pont Neuf across the middle with the round
 * flood openings in its piers, the Pyrenees a faint crest on the horizon,
 * and the Garonne mirroring all of it. Facing south, the real sun rises on
 * the left, crosses over the mountains and sets on the right.
 *
 * Built once per viewport into an indexed buffer: each art pixel stores
 * what it is (a material and a shade), never a colour. ./light turns that
 * into colour for any sun position in one lookup pass, so the city can be
 * relit every frame while the sun is dragged. Geometry is seeded and the
 * same on every visit (it is a place, not a screensaver).
 *
 * Code layout (16 bits): flags << 10 | material << 4 | shade.
 *   flags: WATER (a reflection), LANE (a ripple catching light), DEEP
 *   (nearer the viewer, darker); stars reuse the flag bits as brightness.
 */

import { MAT, WATER, LANE, DEEP, type City, type Lamp, type Twinkle } from "./materials";
export { MAT, WATER, LANE, DEEP, type City, type Lamp, type Twinkle };

const c01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, v: number) => {
  const t = c01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const B4 = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));
const bayer4 = (x: number, y: number) => B4[((y & 3) << 2) | (x & 3)];
/** quantize 0..1 into `levels` steps, dithered between steps */
const q4 = (v: number, x: number, y: number, levels: number) =>
  Math.min(levels, Math.max(0, Math.floor(v * levels + bayer4(x, y))));

function hash2(x: number, y: number, s: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
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

function vnoise(x: number, seed: number) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash2(i, 7, seed);
  return a + (hash2(i + 1, 7, seed) - a) * u;
}

/** Midpoint-displaced crest through key points: height per column. */
function crestFromKeys(keys: [number, number][], W: number, x0: number, span: number, peak: number, rough: number, seed: number) {
  const rng = mulberry32(seed);
  let pts = keys.map(([x, h]) => ({ x: x0 + x * span, y: h * peak }));
  for (let it = 0; it < 9; it++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = b.x - a.x;
      if (len > 1.5) next.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + (rng() - 0.5) * (len / span) * peak * rough });
      next.push(b);
    }
    pts = next;
  }
  const out = new Float32Array(W);
  let j = 0;
  for (let x = 0; x < W; x++) {
    while (j < pts.length - 2 && pts[j + 1].x < x) j++;
    const a = pts[j];
    const b = pts[j + 1];
    out[x] = x < pts[0].x || x > pts[pts.length - 1].x ? 0 : a.y + (b.y - a.y) * c01((x - a.x) / Math.max(1e-3, b.x - a.x));
  }
  return out;
}

/* The Pyrenees from Toulouse: a long low wall, the Néouvielle and the Pic
   du Midi rising a little in the middle-left, gentler to the east. */
const RANGE_KEYS: [number, number][] = [
  [0, 0],
  [0.04, 0.22],
  [0.1, 0.36],
  [0.17, 0.3],
  [0.24, 0.62],
  [0.3, 0.5],
  [0.36, 1.0],
  [0.4, 0.74],
  [0.46, 0.86],
  [0.53, 0.56],
  [0.6, 0.66],
  [0.68, 0.42],
  [0.76, 0.5],
  [0.85, 0.3],
  [0.93, 0.18],
  [1, 0],
];

/* The Pont Neuf, left to right (Daurade to Saint-Cyprien): seven unequal
   arches between wide piers, in relative units. */
const ARCHES = [15, 26, 28, 32, 27, 25, 17];
const PIER = 7;
const END = 4;

/* ───────────────────────────── the build ───────────────────────────── */

type B = {
  W: number;
  H: number;
  idx: Uint16Array<ArrayBuffer>;
  rnd: () => number;
};

const code = (mat: number, shade = 0, flags = 0) => (flags << 10) | (mat << 4) | (shade & 15);

function put(b: B, x: number, y: number, c: number) {
  if (x < 0 || y < 0 || x >= b.W || y >= b.H) return;
  b.idx[y * b.W + x] = c;
}
function rect(b: B, x0: number, y0: number, x1: number, y1: number, c: number) {
  const xa = Math.max(0, Math.floor(x0));
  const xb = Math.min(b.W - 1, Math.ceil(x1) - 1);
  const ya = Math.max(0, Math.floor(y0));
  const yb = Math.min(b.H - 1, Math.ceil(y1) - 1);
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) b.idx[y * b.W + x] = c;
}
const matOf = (b: B, x: number, y: number) => (b.idx[y * b.W + x] >> 4) & 63;


export function buildCity(W: number, H: number): City {
  const idx = new Uint16Array(W * H);
  const b: B = { W, H, idx, rnd: mulberry32(0x70a1) };

  const aspect = W / H;
  const wide = smoothstep(0.62, 1.45, aspect);
  const S = Math.min(H, W * lerp(1.15, 0.78, wide));
  // phones: the city sits low, under the home screen's icons
  const hz = Math.round(H * lerp(0.74, 0.6, wide));
  const vx = W * lerp(0.4, 0.5, wide);
  const xa = Math.round(W * lerp(0.035, 0.18, wide));
  const xb = Math.round(W * lerp(0.69, 0.79, wide));
  // the Pont Neuf, deck to water, at its depth
  const bridgeH = Math.max(6, Math.round(S * 0.082));
  const deck = hz - 1;
  const Lf = deck + bridgeH;
  const top = Math.round(H * 0.09);

  /* ── sky: 16 bands from the top to the horizon, dithered ── */
  for (let y = 0; y < H; y++) {
    const t = c01(y / hz);
    for (let x = 0; x < W; x++) idx[y * W + x] = code(MAT.SKY, q4(t, x, y, 15));
  }

  /* ── stars ── */
  const twinkles: Twinkle[] = [];
  {
    const r = mulberry32(0xe11107);
    const want = Math.round((W * hz) / 120);
    const inks = ["#ebe9e1", "#89b4a8", "#aea3c8"];
    const bright: { x: number; y: number; b: number; c: string }[] = [];
    for (let k = 0; k < 1600; k++) {
      const u = r();
      const v = Math.pow(r(), 1.25);
      const br = r();
      const ti = r();
      if (k >= want) continue;
      const x = Math.floor(u * W);
      const y = Math.floor(v * hz * 0.9);
      if (y < 1) continue;
      const lvl = 1 + Math.floor(br * br * br * 6.99);
      idx[y * W + x] = code(MAT.STAR, q4(c01(y / hz), x, y, 15), lvl);
      if (br > 0.9 && y > H * 0.08 && y < hz * 0.7) bright.push({ x, y, b: br, c: inks[Math.floor(ti * 3)] });
    }
    bright.sort((a, z) => z.b - a.b);
    for (let k = 0; k < 3; k++) {
      const t = bright.find((s) => s.x >= (k * W) / 3 && s.x < ((k + 1) * W) / 3);
      if (t) twinkles.push({ x: t.x, y: t.y, c: t.c, d: 3.2 + k * 0.9, delay: k * 1.3 });
    }
  }

  /* ── a few high streaks of cloud, kept to the corners ── */
  {
    const unit = Math.max(1.4, S * 0.007);
    const banks = [
      { x: -0.04, y: 0.17, w: 0.24 },
      { x: 0.8, y: 0.23, w: 0.24 },
      { x: 0.06, y: 0.42, w: 0.16 },
      { x: 0.83, y: 0.45, w: 0.15 },
    ];
    for (const k of banks) {
      const len = k.w * W;
      const x0 = k.x * W;
      const yc = k.y * H;
      for (let x = Math.floor(x0); x < x0 + len; x++) {
        if (x < 0 || x >= W) continue;
        const t = (x - x0) / len;
        const thick = Math.pow(Math.sin(Math.PI * t), 0.8) * unit * (1.3 + vnoise(x * 0.09 + k.x * 9, 53));
        const y0 = yc - thick * 0.6 + (vnoise(x * 0.04 + k.y * 7, 54) - 0.5) * unit * 2;
        for (let y = Math.floor(y0); y < y0 + thick; y++) {
          if (y < 0 || y >= hz) continue;
          const v = (y - y0) / Math.max(1, thick); // 0 top .. 1 belly
          const edge = Math.min(t, 1 - t) * 6;
          if (edge < 1 && bayer4(x, y) > edge) continue;
          idx[y * W + x] = code(MAT.CLOUD, q4(v, x, y, 3));
        }
      }
    }
  }

  /* ── the Pyrenees: faint, snow on the tops ── */
  {
    const peak = Math.max(3, S * 0.06);
    const span = W * lerp(1.6, 1.0, wide);
    const x0 = W * 0.5 - span * 0.47;
    const crest = crestFromKeys(RANGE_KEYS, W, x0, span, peak, 1.1, 0xb1e5);
    for (let x = 0; x < W; x++) {
      const h = crest[x];
      if (h < 0.6) continue;
      const t = Math.ceil(hz - h);
      const slope = crest[Math.min(W - 1, x + 1)] - crest[Math.max(0, x - 1)];
      const facing = slope > 0 ? 0 : 1; // 0 faces east (left), 1 west
      for (let y = Math.max(0, t); y <= hz + 1 && y < H; y++) {
        const depth = (y - t) / Math.max(1, peak);
        const snowy = y - t < h * 0.42 + (bayer4(x, y) - 0.5) * 2 && h > peak * 0.35;
        const haze = q4(c01(depth * 1.4), x, y, 3);
        idx[y * W + x] = code(snowy ? MAT.SNOW : MAT.RANGE, facing * 4 + haze);
      }
    }
  }

  /* ── beyond the bridge: the river running on to the vanishing point,
     the far banks converging on it, low roofs on the horizon ── */
  const farBankTop = new Float32Array(W);
  {
    // the river surface between the far banks
    for (let y = hz; y <= Lf + 1 && y < H; y++) {
      const t = (y - hz) / Math.max(1, Lf - hz);
      for (let x = 0; x < W; x++) idx[y * W + x] = code(MAT.FARWATER, q4(t, x, y, 3));
    }
    // far skyline: roofs of Saint-Cyprien and the Carmes, and the bank walls
    const r = mulberry32(0xfa12);
    let x = 0;
    while (x < W) {
      const w = 2 + Math.floor(r() * 6);
      const h = (0.012 + r() * 0.03) * S * (1.2 - Math.abs(x / W - 0.5));
      for (let k = 0; k < w && x + k < W; k++) farBankTop[x + k] = h;
      x += w;
    }
    for (let x = 0; x < W; x++) {
      // bank edges converge on (vx, hz): left of the left line, right of the right line
      const t = Math.ceil(hz - farBankTop[x]);
      const leftEdge = vx - (vx - xa) * 0.9;
      const rightEdge = vx + (xb - vx) * 0.9;
      for (let y = Math.max(0, t); y <= Lf + 1 && y < H; y++) {
        if (y > hz) {
          const f = (y - hz) / Math.max(1, Lf - hz);
          const le = vx - (vx - leftEdge) * f;
          const re = vx + (rightEdge - vx) * f;
          if (x > le && x < re) continue;
        }
        const win = hash2(x, y, 41) < 0.06 && y > t + 1;
        idx[y * W + x] = win ? code(MAT.WINDOW, Math.floor(hash2(x, y, 42) * 15) | 0) : code(MAT.FAR, y > hz ? 1 : 0);
      }
    }
  }

  /* ── the banks (drawn far to near, so nearer things cover farther) ── */
  // left: f grows from 1 at the bridge to vx/(vx - xa) at the frame's edge
  const fL = (x: number) => (vx - x) / Math.max(1, vx - xa);
  const fR = (x: number) => (x - vx) / Math.max(1, xb - vx);
  /** screen row of a point `h` px above the water at depth factor f */
  const rowAt = (f: number, h: number) => hz + (Lf - hz) * f - h * f;

  // the quay walls and the water's edge
  const quayH = bridgeH * 0.95;
  const yw = new Int16Array(W).fill(Lf + 1);
  for (let x = 0; x < W; x++) {
    let f = 0;
    let face: number = MAT.FACADE_W;
    if (x < xa) {
      f = fL(x);
      face = MAT.FACADE_W;
    } else if (x > xb) {
      f = fR(x);
      face = MAT.FACADE_E;
    } else continue;
    const water = Math.round(rowAt(f, 0));
    const coping = Math.round(rowAt(f, quayH));
    yw[x] = water;
    for (let y = Math.max(0, coping); y < water && y < H; y++) {
      // brick courses, darker toward the water (where the floods stain it)
      const t = (y - coping) / Math.max(1, water - coping);
      const course = (y - coping) % 3 === 2 && hash2(x, y, 7) < 0.3;
      idx[y * W + x] = y === coping ? code(MAT.STONE, 1) : code(face, course ? 3 : 1 + q4(t, x, y, 2));
    }
  }

  // the Daurade quay: brick houses, 4–5 storeys, some with a soleilho (the
  // open gallery under Toulouse roofs), plane trees along the promenade
  const lampsQuay: { x: number; y: number }[] = [];
  if (xa > 1) {
    const zNear = 1 / fL(0);
    const blds: { z0: number; z1: number; h: number; soleilho: boolean; storeys: number }[] = [];
    let z = 1.0;
    while (z > zNear - 0.05) {
      const dz = 0.05 + b.rnd() * 0.07;
      const storeys = 4 + (b.rnd() < 0.45 ? 1 : 0);
      blds.push({ z0: z - dz, z1: z, h: bridgeH * (0.95 + storeys * 0.48 + b.rnd() * 0.25), soleilho: b.rnd() < 0.5, storeys });
      z -= dz;
    }
    // far to near
    for (const bd of blds) {
      const xFar = vx - (vx - xa) / bd.z1;
      const xNear = vx - (vx - xa) / bd.z0;
      for (let x = Math.max(0, Math.floor(xNear)); x <= Math.min(xa, Math.ceil(xFar)); x++) {
        const f = fL(x);
        const zx = 1 / f;
        const roofY = Math.round(rowAt(f, bd.h));
        const footY = Math.round(rowAt(f, quayH)) - 1;
        // position along the facade, 0 at the near end
        const along = (zx - bd.z0) / (bd.z1 - bd.z0);
        const cols = Math.max(3, Math.round((bd.z1 - bd.z0) * 60));
        const colU = along * cols;
        const inCol = colU - Math.floor(colU);
        const winCol = inCol > 0.3 && inCol < 0.7;
        const storeyH = (bd.h - quayH) / (bd.storeys + 0.6);
        for (let y = Math.max(0, roofY - Math.max(1, Math.round(f * 1.2))); y <= footY && y < H; y++) {
          if (y < roofY) {
            idx[y * W + x] = code(MAT.ROOF, y === roofY - 1 ? 1 : 0);
            continue;
          }
          if (y === roofY) {
            idx[y * W + x] = code(MAT.DARK, 1); // the eave's shadow
            continue;
          }
          const hAbove = (rowAt(f, 0) - y) / f; // height above water, px at bridge depth
          const fromTop = (bd.h - hAbove) / storeyH; // storeys down from the eave
          if (bd.soleilho && fromTop < 0.6) {
            idx[y * W + x] = winCol ? code(MAT.DARK, 0) : code(MAT.FACADE_W, 0);
            continue;
          }
          const inStorey = fromTop - Math.floor(fromTop);
          const isWin = winCol && inStorey > 0.25 && inStorey < 0.8 && hAbove > quayH + storeyH * 0.3;
          if (isWin) {
            idx[y * W + x] = code(MAT.WINDOW, Math.floor(hash2(Math.floor(colU), Math.floor(fromTop) + Math.round(bd.z0 * 100), 9) * 15));
            continue;
          }
          // a stone band between ground floor and the rest
          const band = Math.abs(hAbove - (quayH + storeyH * 1.2)) < 0.5 / f + 0.35;
          const t = c01(fromTop / (bd.storeys + 0.6));
          idx[y * W + x] = band ? code(MAT.STONE, 1) : code(MAT.FACADE_W, q4(t * 0.7, x, y, 2));
        }
      }
      // the north side wall where a farther house rises above a nearer one
      const nearer = blds[blds.indexOf(bd) + 1];
      const xEdge = Math.round(xNear);
      if (nearer && bd.h > nearer.h + 0.5 && xEdge > 0) {
        const f = fL(xEdge);
        const depthPx = Math.max(1, Math.round(f * bridgeH * 0.5));
        const y0 = Math.round(rowAt(f, bd.h));
        const y1 = Math.round(rowAt(f, nearer.h));
        rect(b, xEdge - depthPx, y0, xEdge, y1 + 1, code(MAT.FACADE_N, 1));
        rect(b, xEdge - depthPx, y0 - 1, xEdge, y0, code(MAT.ROOF, 1));
      }
    }
    // plane trees on the quay promenade, in front of the ground floors
    for (let zt = 0.97; zt > zNear; zt -= 0.075) {
      const f = 1 / zt;
      const xt = vx - (vx - xa) * f;
      const base = rowAt(f, quayH);
      const crownR = bridgeH * 0.62 * f;
      const crownC = base - bridgeH * 1.05 * f;
      // trunk
      rect(b, xt - Math.max(0.5, f * 0.4), crownC, xt + Math.max(0.5, f * 0.4), base, code(MAT.TRUNK, 0));
      for (let y = Math.floor(crownC - crownR); y <= crownC + crownR * 0.8; y++) {
        for (let x = Math.floor(xt - crownR * 1.15); x <= xt + crownR * 1.15; x++) {
          const dx = (x + 0.5 - xt) / (crownR * 1.15);
          const dy = (y + 0.5 - crownC) / crownR;
          const lump = 0.82 + 0.3 * vnoise(Math.atan2(dy, dx) * 3 + zt * 40, 71);
          const d = dx * dx + dy * dy;
          if (d > lump * lump || x < 0 || y < 0 || x >= W || y >= H) continue;
          // lit from the side the light comes: encoded as side (0 east, 1 top, 2 west) + darkness
          const side = dx < -0.35 ? 0 : dx > 0.35 ? 2 : 1;
          const dark = q4(c01(dy * 0.6 + 0.35), x, y, 3);
          idx[y * W + x] = code(MAT.LEAF, side * 4 + dark);
        }
      }
    }
    // street lamps along the quay
    for (let zt = 0.93; zt > zNear; zt -= 0.15) {
      const f = 1 / zt;
      lampsQuay.push({ x: Math.round(vx - (vx - xa) * f), y: Math.round(rowAt(f, quayH + bridgeH * 0.55)) });
    }
  }

  // La Grave: the long hospital front on the Saint-Cyprien quay and its dome
  {
    const zNear = xb < W - 1 ? 1 / fR(W - 1) : 1;
    const hH = bridgeH * 1.75;
    const storeys = 3;
    for (let x = Math.max(0, xb); x < W; x++) {
      const f = fR(x);
      const zx = 1 / f;
      const roofY = Math.round(rowAt(f, hH));
      const footY = Math.round(rowAt(f, quayH)) - 1;
      const colU = zx * 70;
      const inCol = colU - Math.floor(colU);
      const winCol = inCol > 0.32 && inCol < 0.68;
      const storeyH = (hH - quayH) / (storeys + 0.5);
      for (let y = Math.max(0, roofY - Math.max(1, Math.round(f * 1.4))); y <= footY && y < H; y++) {
        if (y < roofY) {
          idx[y * W + x] = code(MAT.ROOF, y === roofY - 1 ? 1 : 0);
          continue;
        }
        if (y === roofY) {
          idx[y * W + x] = code(MAT.STONE, 0); // a stone cornice
          continue;
        }
        const hAbove = (rowAt(f, 0) - y) / f;
        const fromTop = (hH - hAbove) / storeyH;
        const inStorey = fromTop - Math.floor(fromTop);
        // the ground floor is an arcade
        const ground = hAbove < quayH + storeyH * 0.95;
        const isWin = ground ? winCol && hAbove < quayH + storeyH * 0.75 : winCol && inStorey > 0.25 && inStorey < 0.78;
        if (isWin) {
          idx[y * W + x] = ground ? code(MAT.DARK, 0) : code(MAT.WINDOW, Math.floor(hash2(Math.floor(colU), Math.floor(fromTop), 19) * 15));
          continue;
        }
        idx[y * W + x] = code(MAT.FACADE_E, q4(c01(fromTop / (storeys + 0.5)) * 0.7, x, y, 2));
      }
    }
    void zNear;

    // the dome: a drum with windows, a ribbed copper dome, a lantern
    const zd = lerp(0.84, 0.8, wide);
    const fd = 1 / zd;
    const setback = bridgeH * lerp(0.6, 1.4, wide);
    const cx = vx + (xb - vx) * fd + setback * fd;
    const baseY = rowAt(fd, hH) + 1;
    const rd = bridgeH * lerp(0.95, 0.9, wide) * fd;
    const drumH = bridgeH * 0.8 * fd;
    const domeH = rd * 1.22;
    const lanR = rd * 0.24;
    const lanH = rd * 0.55;
    // drum
    for (let y = Math.floor(baseY - drumH); y < baseY; y++) {
      for (let x = Math.floor(cx - rd); x <= cx + rd; x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const nx = (x + 0.5 - cx) / rd;
        if (Math.abs(nx) > 1) continue;
        const dir = Math.min(7, Math.floor(((nx + 1) / 2) * 8));
        const fromTop = (y - (baseY - drumH)) / drumH;
        // tall windows between pilasters, a cornice on top
        const win = Math.abs(Math.sin(Math.asin(nx) * 4)) > 0.86 && fromTop > 0.3 && fromTop < 0.82 && Math.abs(nx) < 0.8;
        if (fromTop < 0.12) idx[y * W + x] = code(MAT.STONE, dir < 4 ? 0 : 1);
        else idx[y * W + x] = win ? code(MAT.WINDOW, 15) : code(MAT.DRUM, dir);
      }
    }
    // dome: a slightly raised hemisphere, ribs every 22.5°
    const dTop = baseY - drumH;
    for (let y = Math.floor(dTop - domeH); y < dTop; y++) {
      const v = (dTop - y) / domeH; // 0 base .. 1 top
      const half = rd * Math.sqrt(Math.max(0, 1 - v * v)) * (1 - 0.06 * v);
      for (let x = Math.floor(cx - half); x <= cx + half; x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const nx = (x + 0.5 - cx) / Math.max(0.5, half);
        if (Math.abs(nx) > 1) continue;
        const dir = Math.min(7, Math.floor(((nx + 1) / 2) * 8));
        const upper = v > 0.55 ? 8 : 0;
        const rib = Math.abs(Math.sin(Math.asin(Math.max(-1, Math.min(1, nx))) * 4)) < 0.12 && half > 3;
        idx[y * W + x] = rib ? code(MAT.STONE, dir < 4 ? 0 : 1) : code(MAT.COPPER, dir + upper);
      }
    }
    // lantern + finial
    const lTop = dTop - domeH;
    for (let y = Math.floor(lTop - lanH); y < lTop + 1; y++) {
      for (let x = Math.floor(cx - lanR); x <= cx + lanR; x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const nx = (x + 0.5 - cx) / Math.max(0.5, lanR);
        if (Math.abs(nx) > 1) continue;
        const dir = Math.min(7, Math.floor(((nx + 1) / 2) * 8));
        const t = (y - (lTop - lanH)) / lanH;
        idx[y * W + x] = t < 0.35 ? code(MAT.COPPER, dir + 8) : t > 0.5 && t < 0.85 && Math.abs(nx) < 0.5 ? code(MAT.DARK, 0) : code(MAT.DRUM, dir);
      }
    }
    rect(b, cx - 0.5, lTop - lanH - Math.max(1, rd * 0.18), cx + 0.5, lTop - lanH, code(MAT.STONE, 0));
  }

  /* ── the Pont Neuf ── */
  const lamps: Lamp[] = [];
  {
    const total = ARCHES.reduce((a, v) => a + v, 0) + PIER * (ARCHES.length - 1) + END * 2;
    const k = (xb - xa) / total;
    const sp = Math.max(1, Math.round(bridgeH * 0.22)); // springing above the water
    // the deck rises a touch toward the middle
    const hump = (x: number) => Math.round(Math.max(0, bridgeH * 0.07) * Math.sin(Math.PI * c01((x - xa) / (xb - xa))));
    // the body: parapet, cornice, spandrels down to the water
    for (let x = xa; x <= xb; x++) {
      if (x < 0 || x >= W) continue;
      const dTop = deck - hump(x);
      for (let y = Math.max(0, dTop - 1); y <= Lf && y < H; y++) {
        const rel = y - dTop;
        let c: number;
        if (rel <= 0) c = code(MAT.STONE, rel < 0 ? 0 : 1); // parapet coping
        else if (rel === 2) c = code(MAT.STONE, 2); // cornice
        else if (rel === 3) c = code(MAT.DARK, 1); // its shadow
        else c = code(MAT.BRIDGE, q4(c01((y - dTop) / (Lf - dTop)), x, y, 3));
        idx[y * W + x] = c;
      }
    }
    // arches, piers with their round flood openings, lamps over the piers
    let x = xa + END * k;
    lamps.push({ x: Math.round(xa + END * k * 0.5), y: 0, ry: -1 });
    ARCHES.forEach((span, i) => {
      const w = span * k;
      const cxA = x + w / 2;
      const rise = Math.min(w * 0.4, bridgeH * (0.4 + 0.3 * (span / 32)));
      for (let ax = Math.floor(x); ax <= x + w; ax++) {
        if (ax < 0 || ax >= W) continue;
        const u = (ax + 0.5 - cxA) / (w / 2);
        if (Math.abs(u) >= 1) continue;
        const archTop = Lf - sp - rise * Math.sqrt(1 - u * u);
        const ringW = Math.max(1, Math.round(bridgeH * 0.07));
        for (let y = Math.max(0, Math.floor(archTop - ringW)); y <= Lf && y < H; y++) {
          if (y < archTop) {
            // voussoirs: stone and brick in turn
            const vous = Math.floor(Math.atan2(u, (Lf - sp - y) / Math.max(1, rise)) * 6) & 1;
            idx[y * W + ax] = vous ? code(MAT.STONE, 1) : code(MAT.BRIDGE, 0);
          } else if (y < archTop + 1 && rise > 3) {
            idx[y * W + ax] = code(MAT.DARK, 0); // the soffit, seen edge-on
          } else if (y >= Lf - sp && Math.abs(u) > 0.97) {
            idx[y * W + ax] = code(MAT.BRIDGE, 3);
          } else {
            // through the arch: the river beyond, keep what was painted
            const m = matOf(b, ax, y);
            if (m === MAT.BRIDGE || m === MAT.STONE || m === MAT.DARK) idx[y * W + ax] = code(MAT.FARWATER, q4((y - hz) / Math.max(1, Lf - hz), ax, y, 3));
          }
        }
      }
      x += w;
      if (i < ARCHES.length - 1) {
        // a pier: rounded buttress catching light on its sides, a round
        // opening (dégueuloir) through it
        const pw = PIER * k;
        const pc = x + pw / 2;
        for (let px = Math.floor(x); px <= x + pw; px++) {
          if (px < 0 || px >= W) continue;
          const u = (px + 0.5 - pc) / (pw / 2);
          for (let y = deck + 4; y <= Lf && y < H; y++) {
            if (Math.abs(u) > 0.78) idx[y * W + px] = code(u < 0 ? MAT.FACADE_E : MAT.FACADE_W, 2);
          }
        }
        const ro = Math.max(1, pw * 0.3);
        const oy = Lf - sp - bridgeH * 0.42;
        for (let y = Math.floor(oy - ro - 1); y <= oy + ro + 1; y++) {
          for (let px = Math.floor(pc - ro - 1); px <= pc + ro + 1; px++) {
            if (px < 0 || px >= W || y < 0 || y >= H) continue;
            const d = Math.hypot(px + 0.5 - pc, y + 0.5 - oy);
            if (d < ro) idx[y * W + px] = code(MAT.FARWATER, q4((y - hz) / Math.max(1, Lf - hz), px, y, 3));
            else if (d < ro + 1) idx[y * W + px] = code(MAT.STONE, 1);
          }
        }
        lamps.push({ x: Math.round(pc), y: 0, ry: -1 });
        x += pw;
      }
    });
    lamps.push({ x: Math.round(xb - END * k * 0.5), y: 0, ry: -1 });
    // lamp posts on the parapet: a dark pole, the lamp on top
    const lampH = Math.max(2, Math.round(bridgeH * 0.22));
    for (const l of lamps) {
      const dTop = deck - hump(l.x);
      for (let y = dTop - lampH; y < dTop - 1; y++) put(b, l.x, y, code(MAT.TRUNK, 0));
      l.y = dTop - lampH - 1;
      put(b, l.x, l.y, code(MAT.LAMP, 0));
    }
  }

  // quay street lamps: posts with a lamp
  for (const l of lampsQuay) {
    for (let y = l.y + 1; y < l.y + 4; y++) put(b, l.x, y, code(MAT.TRUNK, 0));
    put(b, l.x, l.y, code(MAT.LAMP, 1));
  }

  /* ── the Garonne: every column mirrors what stands above its edge ── */
  for (let x = 0; x < W; x++) {
    const edge = yw[x];
    if (edge >= H) continue;
    const span = Math.max(1, H - edge);
    for (let y = edge; y < H; y++) {
      const dy = y - edge;
      const depth = dy / span;
      const amp = 0.4 + dy * 0.05;
      const rx = Math.round((vnoise(y * 0.7 + x * 0.015, 61) - 0.5) * 2 * amp);
      const sx = Math.min(W - 1, Math.max(0, x + rx));
      const sy = edge - 1 - Math.round(dy * 1.05);
      let src: number;
      if (sy < 0) src = code(MAT.SKY, 0);
      else {
        src = idx[sy * W + sx];
        const m = (src >> 4) & 63;
        if (m === MAT.STAR) src = code(MAT.SKY, src & 15);
        else if (src & (WATER << 0)) src = code(MAT.FARWATER, 3);
      }
      const lane = (dy + Math.floor(vnoise(x * 0.06 + y * 0.2, 62) * 3)) % 3 === 0 && bayer4(x, y) > 0.45;
      let flags = 1 | (lane ? 2 : 0) | (depth > 0.45 ? 4 : 0);
      // the bright line where the water meets the quay or the bridge
      if (dy === 0 && bayer4(x, y) < 0.7) flags |= 2;
      idx[y * W + x] = (src & 0x3ff) | (flags << 10);
    }
  }
  // lamp reflections: a short streak straight below each lamp
  for (const l of lamps) {
    const edge = yw[l.x] ?? H;
    const ry = edge + (edge - l.y) - 1;
    l.ry = ry < H - 1 ? ry : -1;
  }

  /* ── vignette under the menu bar and the dock ── */
  const vig = new Uint8Array(W * H);
  {
    const topBand = H * 0.13;
    const botBand = H * 0.2;
    for (let y = 0; y < H; y++) {
      const vt = y < topBand ? Math.pow(1 - y / topBand, 1.6) * 0.34 : 0;
      const vb = y > H - botBand ? Math.pow((y - (H - botBand)) / botBand, 1.5) * 0.45 : 0;
      for (let x = 0; x < W; x++) {
        const e = Math.abs(x / W - 0.5) * 2;
        const v = Math.min(0.62, vt + vb * (0.45 + 0.55 * smoothstep(0.15, 0.7, e)) + Math.pow(e, 3) * 0.12);
        if (v > 0.01) vig[y * W + x] = q4(v, x, y, 15);
      }
    }
  }

  /* ── the codes in use ── */
  const seen = new Uint8Array(8192);
  const list: number[] = [];
  for (let i = 0; i < idx.length; i++) {
    const c = idx[i];
    if (!seen[c]) {
      seen[c] = 1;
      list.push(c);
    }
  }

  return {
    W,
    H,
    idx,
    vig,
    yw,
    hz,
    codes: Uint16Array.from(list),
    lamps,
    fov: lerp(260, 200, wide),
    top,
    S,
    twinkles,
    plane: { y: Math.round(H * (0.12 + hash2(W, H, 3) * 0.05)) },
  };
}
