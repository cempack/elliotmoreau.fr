import { INK as ATLAS } from "@/components/apps/atlas/planet";
import { PIXEL_FOLD, PIXEL_GLYPHS } from "@/components/PixelLabel";

/**
 * A small software renderer for pixel scenes in the Atlas globe's inks
 * (Now's code city, the Blog's typewriter): flat faces, an orthographic
 * camera that looks down a little, a z-buffer, a shadow map from the sun's
 * side, and flat light Bayer-dithered onto colour ramps, painted into
 * whole 3px cells on the CPU. Objects stand on a turntable that carries the
 * globe's grid and a dotted rim. Cells nothing covers stay transparent, so
 * the scene sits on whatever card holds it.
 */

export const CELL = 3;

export type V3 = [number, number, number];
type RGB = readonly [number, number, number];

/** RGBA packed for a little-endian Uint32 view of ImageData */
export const pack = (c: RGB, k = 1) =>
  ((255 << 24) | (Math.min(255, Math.round(c[2] * k)) << 16) | (Math.min(255, Math.round(c[1] * k)) << 8) | Math.min(255, Math.round(c[0] * k))) >>> 0;

const INKS = {
  ...ATLAS,
  lime: [198, 255, 94],
  ion: [139, 233, 255],
  flare: [240, 51, 74],
  halo: [30, 33, 62],
  orbit: [74, 77, 86],
} satisfies Record<string, RGB>;

/** the inks, packed */
export const P = Object.fromEntries(Object.entries(INKS).map(([k, v]) => [k, pack(v)])) as Record<keyof typeof INKS, number>;

/** a light-to-dark list of colours, packed */
export const ramp = (list: RGB[]) => list.map((c) => pack(c));

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 4×4 Bayer threshold for a cell, in (0, 1) */
export const b4 = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));

/** a stable pseudo-random number in [0, 1) for two integers */
export function hash2(a: number, b: number) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** a seeded xorshift */
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

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/* ── the site's 3×5 capitals (PixelLabel), a few more marks for a typewriter ── */

const MORE: Record<string, string[]> = {
  ";": ["000", "010", "000", "010", "100"],
  "!": ["010", "010", "010", "000", "010"],
  "?": ["110", "001", "010", "000", "010"],
  "(": ["010", "100", "100", "100", "010"],
  ")": ["010", "001", "001", "001", "010"],
};
const GLYPH = new Map(Object.entries({ ...PIXEL_GLYPHS, ...MORE }).map(([k, rows]) => [k, rows.join("")]));
const FOLD: Record<string, string> = { ...PIXEL_FOLD, "’": "'", "‘": "'", "–": "-", "—": "-", Œ: "O", Æ: "A" };

/** a character as the pixel capitals have it: folded, upper case */
export const foldChar = (ch: string) => {
  const up = ch.toUpperCase();
  return FOLD[up] ?? up;
};
/** a character's 15 cells, row by row ("1" lit), or null for a space or an unknown mark */
export const glyphOf = (ch: string) => GLYPH.get(foldChar(ch)) ?? null;

/** pixel capitals into a raster's colours, a cell each, 4 cells a letter */
export function drawText(buf: Uint32Array, W: number, H: number, s: string, x: number, y: number, col: number) {
  for (const ch of s) {
    const g = ch === " " ? null : glyphOf(ch);
    if (g)
      for (let i = 0; i < 15; i++) {
        if (g[i] !== "1") continue;
        const X = x + (i % 3);
        const Y = y + ((i / 3) | 0);
        if (X >= 0 && Y >= 0 && X < W && Y < H) buf[Y * W + X] = col;
      }
    x += ch === " " ? 2 : 4;
  }
}

/* ═════════════ faces ═════════════ */

export type Face = {
  /** corners, ordered so p0→p1 runs "right" and p0→p3 runs "down" seen from outside */
  p: V3[];
  mat: string;
  uv: [number, number][];
  n: V3;
  /** the face's width and height in world units (for patterns that keep their size) */
  fw: number;
  fh: number;
  /** drawn from behind too */
  two: boolean;
  /** casts a shadow */
  cast: boolean;
  side: string;
  /** which of its kind (box side, prism facet) */
  k: number;
  /** the object it belongs to, for picking (-1: none) */
  b: number;
  /** free flag for a material */
  on: boolean;
};

const DEF_UV: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

export function face(out: Face[], pts: V3[], mat: string, extra: Partial<Face> = {}) {
  const f: Face = {
    p: pts,
    mat,
    uv: DEF_UV,
    two: false,
    cast: true,
    side: "",
    k: 0,
    b: -1,
    on: false,
    n: extra.n ?? norm(cross(sub(pts[pts.length - 1], pts[0]), sub(pts[1], pts[0]))),
    fw: len(sub(pts[1], pts[0])),
    fh: len(sub(pts[pts.length - 1], pts[0])),
    ...extra,
  };
  out.push(f);
  return f;
}

/** an axis-aligned box from corner a to corner b, without a floor */
export function box(out: Face[], a: V3, b: V3, mat: string, extra: Partial<Face> = {}) {
  const [a0, a1, a2] = a;
  const [b0, b1, b2] = b;
  face(out, [[a0, b1, a2], [b0, b1, a2], [b0, b1, b2], [a0, b1, b2]], mat, { ...extra, side: "top", k: 4 });
  face(out, [[a0, b1, b2], [b0, b1, b2], [b0, a1, b2], [a0, a1, b2]], mat, { ...extra, side: "z+", k: 0 });
  face(out, [[b0, b1, a2], [a0, b1, a2], [a0, a1, a2], [b0, a1, a2]], mat, { ...extra, side: "z-", k: 2 });
  face(out, [[b0, b1, b2], [b0, b1, a2], [b0, a1, a2], [b0, a1, b2]], mat, { ...extra, side: "x+", k: 1 });
  face(out, [[a0, b1, a2], [a0, b1, b2], [a0, a1, b2], [a0, a1, a2]], mat, { ...extra, side: "x-", k: 3 });
}

/** a cylinder as an n-sided prism along x or y, with caps when matCap is given */
export function prism(out: Face[], axis: "x" | "y", c: V3, r: number, half: number, n: number, matSide: string, matCap: string | null, extra: Partial<Face> = {}) {
  const ring = (s: number) => {
    const pts: V3[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const ca = Math.cos(a) * r;
      const sa = Math.sin(a) * r;
      pts.push(axis === "x" ? [c[0] + s * half, c[1] + ca, c[2] + sa] : [c[0] + ca, c[1] + s * half, c[2] + sa]);
    }
    return pts;
  };
  const lo = ring(-1);
  const hi = ring(1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const am = ((i + 0.5) / n) * Math.PI * 2;
    const nn: V3 = axis === "x" ? [0, Math.cos(am), Math.sin(am)] : [Math.cos(am), 0, Math.sin(am)];
    face(out, [hi[i], hi[j], lo[j], lo[i]], matSide, {
      ...extra,
      n: nn,
      side: "rim",
      k: i,
      uv: [
        [i / n, 0],
        [(i + 1) / n, 0],
        [(i + 1) / n, 1],
        [i / n, 1],
      ],
    });
  }
  if (matCap) {
    const uv: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      uv.push([0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2]);
    }
    const up: V3 = axis === "x" ? [1, 0, 0] : [0, 1, 0];
    face(out, hi, matCap, { ...extra, n: up, side: "cap", uv, fw: 2 * r, fh: 2 * r });
    face(out, lo, matCap, { ...extra, n: mul(up, -1), side: "cap", uv, fw: 2 * r, fh: 2 * r });
  }
}

/** the turntable every object stands on: a flat 64-gon of radius r */
export function turntable(out: Face[], r: number, y: number, mat: string) {
  const pts: V3[] = [];
  const n = 64;
  for (let i = 0; i < n; i++) {
    const a = -(i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  face(out, pts, mat, { n: [0, 1, 0], uv: pts.map(() => [0, 0]), cast: false, side: "floor" });
}

/* ═════════════ camera, raster, draw ═════════════ */

export type Cam = {
  scale: number;
  /** a world point → [cell x, cell y, depth (larger is nearer)] */
  proj: (p: V3) => V3;
  /** how much a normal faces the camera */
  facing: (n: V3) => number;
};

/** orthographic: turn by yaw, tip down by pitch, `scale` cells per world unit, C lands on (cx, cy) */
export function makeCam(yaw: number, pitch: number, scale: number, cx: number, cy: number, C: V3): Cam {
  const cw = Math.cos(yaw);
  const sw = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return {
    scale,
    proj(p) {
      const x = p[0] - C[0];
      const y = p[1] - C[1];
      const z = p[2] - C[2];
      const x1 = x * cw + z * sw;
      const z1 = -x * sw + z * cw;
      return [cx + x1 * scale, cy - (y * cp - z1 * sp) * scale, y * sp + z1 * cp];
    },
    facing(n) {
      const z1 = -n[0] * sw + n[2] * cw;
      return n[1] * sp + z1 * cp;
    },
  };
}

export type Raster = { w: number; h: number; c: Uint32Array; z: Float32Array; id: Int32Array };

export const makeRaster = (w: number, h: number): Raster => ({ w, h, c: new Uint32Array(w * h), z: new Float32Array(w * h), id: new Int32Array(w * h) });

/** a colour for a point of a face (packed), or 0 for nothing there */
export type Shade = (f: Face, u: number, v: number, wx: number, wy: number, wz: number, x: number, y: number) => number;

/** clear depth and picking before a frame (the colours are the caller's) */
export function clearDepth(R: Raster) {
  R.z.fill(-1e9);
  R.id.fill(-1);
}

/** rasterize faces (fans of triangles) with depth test, perspective-free uv and world interpolation */
export function draw(R: Raster, faces: Face[], cam: Cam, shade: Shade) {
  const W = R.w;
  const H = R.h;
  const Z = R.z;
  const Cb = R.c;
  const ID = R.id;
  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi];
    if (!f.two && cam.facing(f.n) <= 1e-4) continue;
    const pts = f.p;
    const n = pts.length;
    const PP = pts.map(cam.proj);
    for (let t = 1; t < n - 1; t++) {
      const a = PP[0];
      const b = PP[t];
      const c = PP[t + 1];
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (area > -1e-7 && area < 1e-7) continue;
      const inv = 1 / area;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      if (x0 > x1 || y0 > y1) continue;
      const ua = f.uv[0];
      const ub = f.uv[t];
      const uc = f.uv[t + 1];
      const wa = pts[0];
      const wb = pts[t];
      const wc = pts[t + 1];
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5;
          const l0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) * inv;
          if (l0 < 0) continue;
          const l1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) * inv;
          if (l1 < 0) continue;
          const l2 = 1 - l0 - l1;
          if (l2 < 0) continue;
          const z = l0 * a[2] + l1 * b[2] + l2 * c[2];
          const k = y * W + x;
          if (z <= Z[k]) continue;
          const col = shade(
            f,
            l0 * ua[0] + l1 * ub[0] + l2 * uc[0],
            l0 * ua[1] + l1 * ub[1] + l2 * uc[1],
            l0 * wa[0] + l1 * wb[0] + l2 * wc[0],
            l0 * wa[1] + l1 * wb[1] + l2 * wc[1],
            l0 * wa[2] + l1 * wb[2] + l2 * wc[2],
            x,
            y
          );
          if (!col) continue;
          Cb[k] = col;
          Z[k] = z;
          ID[k] = f.b;
        }
      }
    }
  }
}

/* ═════════════ shadows ═════════════ */

/** a shadow map seen from the light: the nearest depth along L per texel, over a disc of `radius` round `center` */
export type Shadow = { N: number; Lx: V3; Ly: V3; Lz: V3; r: number; c: V3; d: Float32Array };

export function makeShadow(N: number, L: V3, radius: number, center: V3): Shadow {
  const Lz = norm(L);
  const up: V3 = Math.abs(Lz[1]) > 0.97 ? [1, 0, 0] : [0, 1, 0];
  const Lx = norm(cross(up, Lz));
  const Ly = cross(Lz, Lx);
  return { N, Lx, Ly, Lz, r: radius, c: center, d: new Float32Array(N * N) };
}

export function renderShadow(S: Shadow, faces: Face[]) {
  const { N, d: D, Lx, Ly, Lz, r, c: C } = S;
  D.fill(-1e9);
  const toMap = (p: V3): V3 => {
    const x = p[0] - C[0];
    const y = p[1] - C[1];
    const z = p[2] - C[2];
    return [
      (((x * Lx[0] + y * Lx[1] + z * Lx[2]) / r) * 0.5 + 0.5) * N,
      (0.5 - ((x * Ly[0] + y * Ly[1] + z * Ly[2]) / r) * 0.5) * N,
      x * Lz[0] + y * Lz[1] + z * Lz[2],
    ];
  };
  for (const f of faces) {
    if (!f.cast) continue;
    const n = f.p.length;
    const PP = f.p.map(toMap);
    for (let t = 1; t < n - 1; t++) {
      const a = PP[0];
      const b = PP[t];
      const c = PP[t + 1];
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (area > -1e-7 && area < 1e-7) continue;
      const inv = 1 / area;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
      const x1 = Math.min(N - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      const y1 = Math.min(N - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const l0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) * inv;
          if (l0 < 0) continue;
          const l1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) * inv;
          if (l1 < 0) continue;
          const l2 = 1 - l0 - l1;
          if (l2 < 0) continue;
          const z = l0 * a[2] + l1 * b[2] + l2 * c[2];
          const k = y * N + x;
          if (z > D[k]) D[k] = z;
        }
    }
  }
}

/** is a world point behind something, seen from the light? */
export function inShadow(S: Shadow | null, x: number, y: number, z: number, bias: number) {
  if (!S) return false;
  x -= S.c[0];
  y -= S.c[1];
  z -= S.c[2];
  const X = S.Lx;
  const Y = S.Ly;
  const Zl = S.Lz;
  const i = Math.floor((((x * X[0] + y * X[1] + z * X[2]) / S.r) * 0.5 + 0.5) * S.N);
  const j = Math.floor((0.5 - ((x * Y[0] + y * Y[1] + z * Y[2]) / S.r) * 0.5) * S.N);
  if (i < 0 || j < 0 || i >= S.N || j >= S.N) return false;
  return S.d[j * S.N + i] > x * Zl[0] + y * Zl[1] + z * Zl[2] + bias;
}

/** one face's flat light (ambient + k·lambert, darkened in shadow), Bayer-dithered onto a ramp */
export function lit(rp: number[], f: Face, L: V3, S: Shadow | null, wx: number, wy: number, wz: number, x: number, y: number, amb = 0.16, k = 0.84, bias = 0.03) {
  let lam = f.n[0] * L[0] + f.n[1] * L[1] + f.n[2] * L[2];
  if (lam > 0 && inShadow(S, wx, wy, wz, bias)) lam *= 0.22;
  if (lam < 0) lam = 0;
  const n = rp.length;
  const i = Math.floor((amb + k * lam) * (n - 1) + b4(x, y));
  return rp[i < 0 ? 0 : i > n - 1 ? n - 1 : i];
}

/** the turntable's top: the globe's grid (rings and spokes a cell wide), darker towards a dotted rim */
export function turntableInk(wx: number, wz: number, r: number, x: number, y: number, scale: number, shadowed: boolean, night: boolean) {
  const fr = Math.hypot(wx, wz);
  if (fr > r - 1.2 / scale) {
    const a = Math.atan2(wz, wx);
    return Math.floor(((a + Math.PI) * r * scale) / 2.2) % 2 ? P.orbit : 0;
  }
  const ring = (fr / 0.42) % 1 < 1.1 / (scale * 0.42);
  const deg = Math.atan2(wz, wx) * 57.2958;
  const spoke = ((deg % 30) + 30) % 30 < (1.1 / (scale * Math.max(fr, 0.2))) * 57.2958;
  const onGrid = ring || spoke;
  const bx = b4(x, y);
  if (shadowed) return onGrid ? P.gridNight : bx < 0.5 ? P.oceanNight : P.oceanNight2;
  if (fr > r * 0.78 && bx < (fr / r - 0.78) * 3.5) return P.oceanDeep;
  if (night) return onGrid ? P.gridNight : bx < 0.25 ? P.oceanNight : P.oceanNight2;
  return onGrid ? P.grid : P.ocean;
}

/** a dithered glow behind the scene; everything else clear */
export function halo(R: Raster, cx: number, cy: number, r: number) {
  const { w: W, h: H, c } = R;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - cx) / r, (y - cy) / r);
      c[y * W + x] = d < 1 && (1 - d) * 0.35 > b4(x, y) ? P.halo : 0;
    }
}

/* ═════════════ the canvas and its loop ═════════════ */

export type PixelLoop = {
  /** ask for a frame (and more while the scene wants them) */
  wake: () => void;
  /** seconds since the loop started */
  clock: () => number;
  /** the raster on screen now (null before the first layout) */
  raster: () => Raster | null;
  dispose: () => void;
};

/**
 * Runs a scene in a canvas of whole cells, scaled up crisp by CSS: sized by
 * a ResizeObserver on `host`, painted only while on screen and the tab is
 * visible, at most 30 times a second, and only for as long as `frame`
 * returns true (an idle scene costs nothing). `size` turns the host's size
 * in CSS px into the raster's size in cells.
 */
export function pixelLoop(opts: {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  size: (wPx: number, hPx: number) => [number, number];
  frame: (R: Raster, t: number, dt: number) => boolean;
}): PixelLoop {
  const { host, canvas } = opts;
  const T0 = performance.now();
  const clock = () => (performance.now() - T0) / 1000;
  let R: Raster | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let img: ImageData | null = null;
  let out: Uint32Array | null = null;
  let visible = false;
  let raf = 0;
  let last = 0;
  let lastPaint = -1;

  const paint = () => {
    if (!R || !ctx || !img || !out) return false;
    const t = clock();
    const dt = Math.min(0.1, Math.max(0, t - last));
    last = t;
    const more = opts.frame(R, t, dt);
    out.set(R.c);
    ctx.putImageData(img, 0, 0);
    lastPaint = t;
    return more;
  };
  const tick = () => {
    raf = 0;
    if (!visible || document.hidden) return;
    if (clock() - lastPaint < 1 / 30) {
      raf = requestAnimationFrame(tick);
      return;
    }
    if (paint()) raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
  };
  const layout = () => {
    const r = host.getBoundingClientRect();
    const [w, h] = opts.size(r.width, r.height);
    if (w < 8 || h < 8) return;
    if (!R || R.w !== w || R.h !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${w * CELL}px`;
      canvas.style.height = `${h * CELL}px`;
      ctx = canvas.getContext("2d");
      if (!ctx) return;
      img = ctx.createImageData(w, h);
      out = new Uint32Array(img.data.buffer);
      R = makeRaster(w, h);
    }
    // off screen, the first frame waits until it shows (a resize repaints at once, no stretched frame)
    if (visible) paint();
    wake();
  };

  const ro = new ResizeObserver(layout);
  ro.observe(host);
  const io = new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      wake();
    },
    { rootMargin: "80px" }
  );
  io.observe(host);
  const onVis = () => wake();
  document.addEventListener("visibilitychange", onVis);
  layout();

  return {
    wake,
    clock,
    raster: () => R,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    },
  };
}
