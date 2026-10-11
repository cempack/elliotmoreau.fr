import type { SkyPhase } from "../sky";

/**
 * emOS wallpaper painter: a still pixel-art valley under the glass.
 *
 * Painted once into a low-resolution RGBA buffer (one art pixel = 3–4 CSS
 * px, upscaled with `image-rendering: pixelated`) and never animated.
 * Passes, back to front:
 *   sky ramp (Bayer-dithered bands, a glow pooling toward the light) →
 *   milky way → stars → clouds → sun / real moon phase with stepped rings →
 *   ghost range → far Alps (midpoint-displaced crest, lit and shaded faces
 *   split by ridgelines, snow, alpenglow) → forested mid ridge → Massif
 *   Central puys with a hilltop village → lake mirroring it all with a
 *   glitter path → foreground pines → vignette under the menu bar and dock.
 *
 * Geometry is seeded and identical on every visit (it is a place, not a
 * screensaver); only light and colour follow the phase and the Paris hour.
 * Each pass is a small top-level function over a shared buffer, so the JIT
 * keeps the hot loops tight: ~140k art pixels paint in a few milliseconds.
 */

type RGB = [number, number, number];

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const c01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ci = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smoothstep = (a: number, b: number, v: number) => {
  const t = c01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ordered dithering: Bayer 4×4 for the chunky bands, 8×8 for fine haze
const B4 = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));
const B8 = new Float32Array(
  [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20,
    62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37,
    63, 31, 55, 23, 61, 29, 53, 21,
  ].map((v) => (v + 0.5) / 64)
);
const bayer4 = (x: number, y: number) => B4[((y & 3) << 2) | (x & 3)];
const bayer8 = (x: number, y: number) => B8[((y & 7) << 3) | (x & 7)];
/** Quantize 0..1 into `levels` steps, dithered between steps (4×4). */
const q4 = (v: number, x: number, y: number, levels: number) => c01(Math.floor(v * levels + bayer4(x, y)) / levels);
/** Same with the finer 8×8 matrix, for soft glows. */
const q8 = (v: number, x: number, y: number, levels: number) => c01(Math.floor(v * levels + bayer8(x, y)) / levels);

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

/** Smooth 1D value noise in 0..1. */
function vnoise(x: number, seed: number) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash2(i, 7, seed);
  return a + (hash2(i + 1, 7, seed) - a) * u;
}
function fbm(x: number, seed: number, oct: number) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x * f + o * 17.3, seed);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/* ───────────────────────────── palettes ───────────────────────────── */

type Phase = {
  /** sky stops, 0 = top of screen, 1 = horizon */
  sky: [number, string][];
  /** light pooling on the horizon toward the sun (or the town at night) */
  glow: string;
  glowAmt: number;
  stars: number; // density multiplier
  starLum: number; // stars only where the sky is darker than this
  milky: number; // milky way strength
  far: { rock: string; lit: string; snow: string; snowShade: string; edge: string };
  mid: { body: string; rim: string };
  near: { body: string; rim: string };
  fore: { body: string; rim: string };
  haze: string; // valley mist between the layers
  shore: string; // the thin luminous line where lake meets land
  lake: string;
  lakeHi: string;
  glint: string;
  windows: number; // share of lit village windows
  wall: string;
  roof: string;
  cloud: { lit: string; body: string; shade: string; underlit: boolean } | null;
  body: "sun" | "moon";
  core: string;
  rim: string;
  halo: string;
  haloAmt: number;
  vignette: string;
};

const PHASES: Record<SkyPhase, Phase> = {
  night: {
    sky: [
      [0, "#040607"],
      [0.3, "#060a0b"],
      [0.58, "#0a1314"],
      [0.82, "#101d1e"],
      [1, "#152626"],
    ],
    glow: "#2c4440",
    glowAmt: 0.2,
    stars: 1,
    starLum: 0.2,
    milky: 0.7,
    far: { rock: "#111d1d", lit: "#1a2a29", snow: "#4f6560", snowShade: "#2a3a38", edge: "#6f8a82" },
    mid: { body: "#0c1716", rim: "#1c2e2b" },
    near: { body: "#081210", rim: "#172723" },
    fore: { body: "#040807", rim: "#111d19" },
    haze: "#203631",
    shore: "#3f5a50",
    lake: "#060d0d",
    lakeHi: "#21352f",
    glint: "#f0dca8",
    windows: 0.78,
    wall: "#1f2e2a",
    roof: "#0a1210",
    cloud: null,
    body: "moon",
    core: "#efeee4",
    rim: "#d4d0b8",
    halo: "#a9bdb2",
    haloAmt: 0.2,
    vignette: "#010303",
  },
  dawn: {
    sky: [
      [0, "#0a1213"],
      [0.28, "#20302f"],
      [0.6, "#5e6a62"],
      [0.84, "#b39a80"],
      [1, "#d6b48c"],
    ],
    glow: "#f0d3a0",
    glowAmt: 0.45,
    stars: 0.5,
    starLum: 0.1,
    milky: 0,
    far: { rock: "#3a4643", lit: "#5b6660", snow: "#e6cfb4", snowShade: "#98928a", edge: "#f2dcc0" },
    mid: { body: "#26332e", rim: "#5a6656" },
    near: { body: "#1a2822", rim: "#3f4e40" },
    fore: { body: "#0b130f", rim: "#24332a" },
    haze: "#9a9a86",
    shore: "#e8caa0",
    lake: "#1f2c2a",
    lakeHi: "#8f8e7c",
    glint: "#fbe6bc",
    windows: 0.32,
    wall: "#4a5148",
    roof: "#1c2420",
    cloud: { lit: "#e8c9a4", body: "#6c726a", shade: "#3f4844", underlit: true },
    body: "sun",
    core: "#fff4de",
    rim: "#f2d79e",
    halo: "#f0cf98",
    haloAmt: 0.5,
    vignette: "#040807",
  },
  day: {
    sky: [
      [0, "#16252a"],
      [0.26, "#2b4249"],
      [0.64, "#557379"],
      [0.88, "#86a1a2"],
      [1, "#a9bdb9"],
    ],
    glow: "#dfe8e2",
    glowAmt: 0.16,
    stars: 0,
    starLum: 0,
    milky: 0,
    far: { rock: "#4d6668", lit: "#6d8786", snow: "#dfe8e4", snowShade: "#a2b6b2", edge: "#f4f8f4" },
    mid: { body: "#2c4a44", rim: "#4f6e64" },
    near: { body: "#1f3d2e", rim: "#365a42" },
    fore: { body: "#0e2116", rim: "#22402b" },
    haze: "#7f9d9b",
    shore: "#cfdcd6",
    lake: "#26443f",
    lakeHi: "#7c9c97",
    glint: "#f6faf6",
    windows: 0,
    wall: "#c4cfc8",
    roof: "#5c4a46",
    cloud: { lit: "#e3ebe7", body: "#b6c6c2", shade: "#86a09c", underlit: false },
    body: "sun",
    core: "#fbfbf0",
    rim: "#eeeacc",
    halo: "#f2f1dc",
    haloAmt: 0.36,
    vignette: "#050c0a",
  },
  dusk: {
    sky: [
      [0, "#07090c"],
      [0.28, "#1b2228"],
      [0.6, "#4b4a4f"],
      [0.85, "#a36f5c"],
      [1, "#c98762"],
    ],
    glow: "#e0b07a",
    glowAmt: 0.5,
    stars: 0.45,
    starLum: 0.09,
    milky: 0,
    far: { rock: "#2d2f33", lit: "#4b4144", snow: "#e0a88a", snowShade: "#7a5f5c", edge: "#efc4a0" },
    mid: { body: "#1d2425", rim: "#4f4645" },
    near: { body: "#131c1a", rim: "#3a3a34" },
    fore: { body: "#070c0a", rim: "#1d2420" },
    haze: "#806660",
    shore: "#e6ad86",
    lake: "#151b1c",
    lakeHi: "#7c605a",
    glint: "#f6cc9a",
    windows: 0.82,
    wall: "#3d3a3a",
    roof: "#141616",
    cloud: { lit: "#e0a884", body: "#55484c", shade: "#2f2c31", underlit: true },
    body: "sun",
    core: "#ffe9c0",
    rim: "#e6be7c",
    halo: "#e8a674",
    haloAmt: 0.55,
    vignette: "#030504",
  },
};

/* Far range key points (x as a share of width, height as a share of the
   peak budget), roughened by midpoint displacement. A broad massif on the
   left, a sharp pyramid on the right, low cols in the middle so the upper
   centre stays calm. */
const FAR_KEYS: [number, number][] = [
  [-0.04, 0.5],
  [0.0, 0.66],
  [0.035, 0.78],
  [0.06, 0.7],
  [0.105, 1.0],
  [0.135, 0.84],
  [0.165, 0.9],
  [0.2, 0.6],
  [0.235, 0.66],
  [0.28, 0.4],
  [0.33, 0.46],
  [0.38, 0.27],
  [0.43, 0.33],
  [0.48, 0.22],
  [0.535, 0.3],
  [0.585, 0.24],
  [0.635, 0.42],
  [0.675, 0.36],
  [0.72, 0.58],
  [0.76, 0.5],
  [0.815, 0.96],
  [0.85, 0.7],
  [0.885, 0.76],
  [0.925, 0.55],
  [0.965, 0.7],
  [1.04, 0.52],
];
/* A ghost range further still, peeking over the low middle in sky colours. */
const GHOST_KEYS: [number, number][] = [
  [0.2, 0.2],
  [0.27, 0.42],
  [0.33, 0.34],
  [0.4, 0.5],
  [0.46, 0.38],
  [0.52, 0.47],
  [0.58, 0.36],
  [0.64, 0.52],
  [0.7, 0.4],
  [0.78, 0.22],
];
/* Massif Central puys on the near ridge: rounded volcanic domes, two with
   a crater notch. The village sits on the one at 0.665. */
const PUYS = [
  { x: 0.04, h: 0.052, w: 0.075, crater: false },
  { x: 0.15, h: 0.03, w: 0.045, crater: true },
  { x: 0.23, h: 0.02, w: 0.06, crater: false },
  { x: 0.37, h: 0.016, w: 0.09, crater: false },
  { x: 0.52, h: 0.012, w: 0.07, crater: false },
  { x: 0.665, h: 0.038, w: 0.08, crater: false },
  { x: 0.8, h: 0.05, w: 0.05, crater: true },
  { x: 0.88, h: 0.028, w: 0.05, crater: false },
  { x: 0.98, h: 0.045, w: 0.07, crater: false },
];
const VILLAGE_X = 0.665;

/** Midpoint-displaced crest through key points: height above the base per
    column. Displacement scales with the segment's share of the width, so
    the silhouette keeps its character at every viewport size. */
function crestFromKeys(keys: [number, number][], W: number, peak: number, rough: number, seed: number) {
  const rng = mulberry32(seed);
  let pts = keys.map(([x, h]) => ({ x: x * W, y: h * peak }));
  for (let it = 0; it < 9; it++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = b.x - a.x;
      if (len > 1.5) {
        next.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + (rng() - 0.5) * (len / W) * peak * rough });
      }
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
    out[x] = a.y + (b.y - a.y) * c01((x - a.x) / Math.max(1e-3, b.x - a.x));
  }
  return out;
}

/* ───────────────────────────── the scene ───────────────────────────── */

type Scene = {
  d: Uint8ClampedArray<ArrayBuffer>;
  W: number;
  H: number;
  phase: SkyPhase;
  P: Phase;
  S: number; // vertical budget
  U: number; // horizontal unit for flank widths
  Hz: number; // horizon (far range foot)
  Ly: number; // lake level
  PEAK: number;
  bx: number;
  by: number;
  lightLeft: boolean;
  bodyVisible: boolean;
  moon: number;
  moonLit: number;
  ramp: RGB[];
  haze: RGB;
  skyLum: Float32Array;
  nearTop: Float32Array;
  foreTop: Float32Array;
  twinkles: { x: number; y: number; c: string; b: number }[];
};

function put(s: Scene, x: number, y: number, c: RGB) {
  if (x < 0 || y < 0 || x >= s.W || y >= s.H) return;
  const i = (y * s.W + x) * 4;
  const d = s.d;
  d[i] = c[0];
  d[i + 1] = c[1];
  d[i + 2] = c[2];
  d[i + 3] = 255;
}
function tint(s: Scene, x: number, y: number, c: RGB, a: number) {
  if (x < 0 || y < 0 || x >= s.W || y >= s.H || a <= 0) return;
  const i = (y * s.W + x) * 4;
  const d = s.d;
  const t = a > 1 ? 1 : a;
  d[i] += (c[0] - d[i]) * t;
  d[i + 1] += (c[1] - d[i + 1]) * t;
  d[i + 2] += (c[2] - d[i + 2]) * t;
}
/** Write `c`, pulled toward `a` by `ta`, then toward `b` by `tb`. */
function put2(s: Scene, x: number, y: number, c: RGB, a: RGB, ta: number, b: RGB, tb: number) {
  if (x < 0 || y < 0 || x >= s.W || y >= s.H) return;
  let r = c[0];
  let g = c[1];
  let bl = c[2];
  if (ta > 0) {
    r += (a[0] - r) * ta;
    g += (a[1] - g) * ta;
    bl += (a[2] - bl) * ta;
  }
  if (tb > 0) {
    r += (b[0] - r) * tb;
    g += (b[1] - g) * tb;
    bl += (b[2] - bl) * tb;
  }
  const i = (y * s.W + x) * 4;
  const d = s.d;
  d[i] = r;
  d[i + 1] = g;
  d[i + 2] = bl;
  d[i + 3] = 255;
}

/** The wordmark's stage: kept quiet. */
function calm(s: Scene, x: number, y: number) {
  const dx = (x / s.W - 0.5) / 0.44;
  const dy = (y / s.H - 0.42) / 0.24;
  return dx * dx + dy * dy < 1;
}

function skyPass(s: Scene) {
  const { W, H, Hz, P, ramp, d } = s;
  const N = ramp.length;
  const glowC = hex(P.glow);
  // the sun pools light along the horizon on its side; at night a faint
  // town glow sits over the village
  const glowX = s.phase === "night" ? VILLAGE_X * W : s.bx;
  const spread = s.phase === "night" ? 0.2 * W : s.phase === "day" ? 0.6 * W : 0.42 * W;
  const gxs = new Float32Array(W);
  for (let x = 0; x < W; x++) gxs[x] = Math.exp(-(((x - glowX) / spread) ** 2)) * P.glowAmt;
  for (let y = 0; y < H; y++) {
    const ty = c01(y / Hz);
    const gy = Math.pow(c01(1 - (Hz - y) / (H * 0.5)), 2.2);
    for (let x = 0; x < W; x++) {
      const g = gxs[x] * gy;
      const f = c01(ty + g * 0.22) * (N - 1);
      const i = Math.floor(f);
      const c = ramp[f - i > bayer4(x, y) && i < N - 1 ? i + 1 : i];
      const qa = g > 0.01 ? q8(g * 0.9, x, y, 5) * 0.6 : 0;
      put2(s, x, y, c, glowC, qa, c, 0);
      if (y < Hz) {
        const k = (y * W + x) * 4;
        s.skyLum[y * W + x] = (0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) / 255;
      }
    }
  }
}

function milkyPass(s: Scene) {
  const { W, H, Hz, P } = s;
  if (P.milky <= 0) return;
  const lilac = hex("#7f9a90");
  const dust = hex("#c6d2c8");
  const ax = 0.6 * W;
  const ay = -0.06 * H;
  const lx = 1.12 * W - ax;
  const ly = 0.62 * H - ay;
  const len = Math.hypot(lx, ly);
  const ux = lx / len;
  const uy = ly / len;
  const width = Math.max(10, 0.08 * W);
  const reach = width * 1.75;
  for (let y = 0; y < Hz; y++) {
    const fade = 1 - 0.65 * smoothstep(0.5, 1, y / Hz);
    for (let x = 0; x < W; x++) {
      const across = (x - ax) * uy - (y - ay) * ux;
      if (across > reach || across < -reach) continue;
      const along = (x - ax) * ux + (y - ay) * uy;
      const band = Math.exp(-((across / width) ** 2));
      const clump = fbm(along * 0.045 + across * 0.02, 31, 3);
      const laneC = across + width * 0.5 * (clump - 0.5);
      const lane = 1 - 0.7 * Math.exp(-((laneC / (width * 0.2)) ** 2));
      const v = band * (0.3 + 0.95 * clump) * lane * P.milky * fade;
      const q = q8(v * 0.55, x, y, 6);
      if (q > 0) tint(s, x, y, lilac, q * 0.3);
      if (hash2(x, y, 77) < band * clump * clump * 0.07) tint(s, x, y, dust, 0.3 + clump * 0.35);
    }
  }
}

function starsPass(s: Scene) {
  const { W, H, Hz, P } = s;
  if (P.stars <= 0) return;
  const rnd = mulberry32(0xe11107);
  const inks = ["#ebe9e1", "#ebe9e1", "#ebe9e1", "#bcc2ba", "#89b4a8", "#aea3c8", "#aea3c8"].map(hex);
  const rare = hex("#e0bd6e");
  const white: RGB = [255, 255, 255];
  const want = Math.round(((W * Hz) / 110) * P.stars);
  for (let k = 0; k < 1400; k++) {
    // draw every roll even when skipping, so the field is stable
    const u = rnd();
    const v = Math.pow(rnd(), 1.3);
    const b = rnd();
    const ti = rnd();
    const keep = rnd();
    if (k >= want) continue;
    const x = Math.floor(u * W);
    const y = Math.floor(v * Hz * 0.96);
    if (calm(s, x, y) && keep < 0.6) continue;
    const sl = s.skyLum[y * W + x];
    if (sl > P.starLum) continue;
    const fade = 1 - smoothstep(P.starLum * 0.55, P.starLum, sl);
    const col = ti < 0.035 ? rare : inks[Math.floor(ti * inks.length)];
    const a = (0.16 + b * b * b * 0.84) * fade;
    tint(s, x, y, col, a);
    if (b > 0.975) {
      tint(s, x - 1, y, col, a * 0.38);
      tint(s, x + 1, y, col, a * 0.38);
      tint(s, x, y - 1, col, a * 0.38);
      tint(s, x, y + 1, col, a * 0.38);
      put(s, x, y, mix(col, white, 0.45));
    }
    if (b > 0.88 && fade > 0.8 && y > H * 0.07 && y < Hz * 0.75) {
      s.twinkles.push({ x, y, c: ["#ebe9e1", "#89b4a8", "#aea3c8"][Math.floor(ti * 3)], b });
    }
  }
}

type Puff = { x: number; y: number; rx: number; ry: number };

function cloudsPass(s: Scene) {
  const { W, H, Hz, P, S, bx } = s;
  const cl = P.cloud;
  if (!cl) return;
  const lit = hex(cl.lit);
  const body = hex(cl.body);
  const shade = hex(cl.shade);
  const litBody = mix(body, lit, 0.4);
  const unit = Math.max(1.6, S * 0.0075);
  const clouds: Puff[][] = [];
  if (cl.underlit) {
    // a few long lenticular banks, thick in the middle, tapered ends; high
    // in the corners or low behind the peaks, never across the wordmark
    const banks = [
      { y: 0.15, x: -0.03, w: 0.2, t: 1 },
      { y: 0.45, x: -0.02, w: 0.17, t: 0.85 },
      { y: 0.19, x: 0.83, w: 0.2, t: 0.9 },
      { y: 0.47, x: 0.84, w: 0.18, t: 0.8 },
    ];
    for (const r of banks) {
      const puffs: Puff[] = [];
      const len = r.w * W;
      const n = Math.max(4, Math.round(len / (unit * 5)));
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        const thick = Math.sin(Math.PI * t) ** 0.7;
        puffs.push({
          x: r.x * W + t * len,
          y: r.y * H - thick * unit * 0.8 + (vnoise(k * 1.9 + r.x * 7, 53) - 0.5) * unit,
          rx: (len / n) * 1.25,
          ry: unit * r.t * (0.7 + 1.9 * thick) * (0.8 + 0.4 * vnoise(k * 3.3 + r.y * 13, 53)),
        });
      }
      clouds.push(puffs);
    }
  } else {
    // fair-weather cumulus: flat bottoms, piled tops, kept to the sides
    const groups = [
      { x: 0.08, y: 0.19, s: 0.8 },
      { x: 0.16, y: 0.52, s: 0.5 },
      { x: 0.9, y: 0.27, s: 0.7 },
      { x: 0.84, y: 0.55, s: 0.45 },
    ];
    for (const g of groups) {
      const puffs: Puff[] = [];
      const base = S * 0.05 * g.s;
      for (let k = 0; k < 5; k++) {
        const t = k / 4 - 0.5;
        const hgt = (1 - Math.abs(t) * 1.3) * base * (0.8 + vnoise(k * 3.1 + g.x * 11, 53) * 0.5);
        puffs.push({ x: g.x * W + t * base * 4.2, y: g.y * H - hgt * 0.35, rx: base * 1.05, ry: Math.max(2, hgt) });
      }
      clouds.push(puffs);
    }
  }
  for (const puffs of clouds) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let lowest = -Infinity;
    for (const p of puffs) {
      minX = Math.min(minX, p.x - p.rx);
      maxX = Math.max(maxX, p.x + p.rx);
      minY = Math.min(minY, p.y - p.ry);
      maxY = Math.max(maxY, p.y + p.ry);
      lowest = Math.max(lowest, p.y);
    }
    const flat = lowest + (cl.underlit ? unit * 0.6 : S * 0.006);
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(Hz, Math.ceil(maxY)); y++) {
      if (y > flat) continue;
      for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(W - 1, Math.ceil(maxX)); x++) {
        let inside = 0;
        for (const p of puffs) {
          const e = ((x + 0.5 - p.x) / p.rx) ** 2 + ((y + 0.5 - p.y) / p.ry) ** 2;
          if (e < 1 && 1 - e > inside) inside = 1 - e;
        }
        if (inside <= 0) continue;
        if (inside < 0.14 && bayer4(x, y) > inside / 0.14) continue; // dithered edge
        const v = c01((y - minY) / Math.max(1, flat - minY)); // 0 top .. 1 bottom
        let c: RGB;
        if (cl.underlit) {
          // lit belly, dusky crown: the light comes from below the horizon
          const toward = 1 - c01(Math.abs(x - bx) / (W * 0.55));
          const k = q4(c01(v * 1.1 + toward * 0.25 - 0.15), x, y, 3);
          c = k >= 0.66 ? lit : k >= 0.33 ? litBody : body;
        } else {
          const k = q4(1 - v, x, y, 3);
          c = k >= 0.66 ? lit : k >= 0.33 ? body : shade;
        }
        tint(s, x, y, c, cl.underlit ? 0.9 : 0.86);
      }
    }
  }
}

function bodyPass(s: Scene) {
  const { W, H, P, S, bx, by } = s;
  if (!s.bodyVisible) return;
  const isMoon = P.body === "moon";
  const r = Math.max(3, Math.round(S * (isMoon ? 0.02 : 0.024)));
  const R = r * (isMoon ? 5 : 5.5);
  const halo = hex(P.halo);
  const amt = P.haloAmt * (isMoon ? 0.35 + 0.65 * s.moonLit : 1) * 1.6;
  for (let y = Math.floor(by - R); y <= by + R; y++) {
    for (let x = Math.floor(bx - R); x <= bx + R; x++) {
      if (y < 0 || y >= H || x < 0 || x >= W) continue;
      const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
      if (d <= r || d > R) continue;
      // two crisp rings, then a faint dithered glow
      let a: number;
      if (d < r + 1.6) a = 0.5;
      else if (d < r + 3.4) a = 0.26;
      else a = q4(Math.pow(1 - (d - r - 3.4) / (R - r - 3.4), 2.2) * 0.9, x, y, 4) * 0.2;
      if (a > 0) tint(s, x, y, halo, a * amt);
    }
  }
  const core = hex(P.core);
  const rim = hex(P.rim);
  if (!isMoon) {
    for (let y = by - r; y <= by + r; y++) {
      for (let x = bx - r; x <= bx + r; x++) {
        const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
        if (d <= r) put(s, x, y, d > r - 1.1 ? rim : core);
      }
    }
    return;
  }
  // the real moon phase (northern hemisphere: waxing lit on the right)
  const k = Math.cos(2 * Math.PI * s.moon);
  const waxing = s.moon < 0.5;
  const dark = hex("#18211f");
  const maria = [
    { x: -0.32, y: -0.18, r: 0.26 },
    { x: 0.22, y: 0.12, r: 0.2 },
    { x: 0.04, y: 0.48, r: 0.14 },
    { x: 0.3, y: -0.38, r: 0.12 },
  ];
  for (let y = by - r; y <= by + r; y++) {
    for (let x = bx - r; x <= bx + r; x++) {
      const nx = (x + 0.5 - bx) / r;
      const ny = (y + 0.5 - by) / r;
      const n2 = nx * nx + ny * ny;
      if (n2 > 1) continue;
      const half = Math.sqrt(Math.max(0, 1 - ny * ny));
      const lit = waxing ? nx > k * half : nx < -k * half;
      if (!lit) {
        put(s, x, y, dark); // earthshine: the dark side stays just visible
        continue;
      }
      let c = mix(rim, core, q4(0.35 + Math.sqrt(1 - n2) * 0.75, x, y, 2));
      for (const m of maria) if (Math.hypot(nx - m.x, ny - m.y) < m.r) c = mix(c, rim, 0.8);
      put(s, x, y, c);
    }
  }
}

function ghostPass(s: Scene) {
  const { W, H, Hz, PEAK, ramp, haze } = s;
  const crest = crestFromKeys(GHOST_KEYS, W, PEAK, 0.9, 0x6057);
  const horizon = ramp[ramp.length - 1];
  const g = mix(haze, horizon, 0.55);
  for (let x = 0; x < W; x++) {
    if (crest[x] <= 0.5) continue;
    const top = Math.max(0, Math.ceil(Hz - crest[x]));
    for (let y = top; y < Hz + 4 && y < H; y++) {
      // its foot melts into the horizon glow
      put2(s, x, y, g, horizon, q4(c01((y - top) / (PEAK * 0.3)), x, y, 4) * 0.5, g, 0);
    }
  }
}

type Ridgeline = { x: number; y: number; kind: 1 | -1; drift: number; seed: number };

function farPass(s: Scene) {
  const { W, H, Hz, PEAK, U, P, haze, lightLeft } = s;
  const farH = crestFromKeys(FAR_KEYS, W, PEAK, 1.15, 0xa195);
  // ridgelines: a spine falls from every summit, a gully from every col,
  // so each face reads as lit or shaded like a real massif
  const prom = Math.max(2, PEAK * 0.035);
  const lines: Ridgeline[] = [];
  let dir = 1;
  let candX = 0;
  let candV = farH[0];
  for (let x = 1; x < W; x++) {
    const v = farH[x];
    if (dir > 0) {
      if (v > candV) {
        candV = v;
        candX = x;
      } else if (candV - v > prom) {
        lines.push({ x: candX, y: Hz - candV, kind: 1, drift: (hash2(candX, 1, 9) - 0.5) * 1.1, seed: candX });
        dir = -1;
        candV = v;
        candX = x;
      }
    } else if (v < candV) {
      candV = v;
      candX = x;
    } else if (v - candV > prom) {
      lines.push({ x: candX, y: Hz - candV, kind: -1, drift: (hash2(candX, 2, 9) - 0.5) * 0.5, seed: candX });
      dir = 1;
      candV = v;
      candX = x;
    }
  }
  const far = P.far;
  const rock = hex(far.rock);
  const rockLit = hex(far.lit);
  const snow = hex(far.snow);
  const snowShade = hex(far.snowShade);
  const edge = hex(far.edge);
  const deep = mix(rock, hex(P.vignette), 0.35);
  const n = lines.length;
  const lineX = new Float32Array(n);
  const tops = new Int32Array(W);
  const snowLine = new Float32Array(W);
  const streak = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    tops[x] = Math.max(0, Math.ceil(Hz - farH[x]));
    snowLine[x] = Hz - PEAK * (0.5 + 0.26 * (fbm((x / U) * 14, 13, 3) - 0.5));
    streak[x] = vnoise((x / U) * 120, 15) > 0.62 ? PEAK * 0.14 * vnoise((x / U) * 40, 15) : 0;
  }
  let minTop = H;
  for (let x = 0; x < W; x++) minTop = Math.min(minTop, tops[x]);
  const hazeTop = Hz - PEAK * 0.62;
  for (let y = minTop; y < H; y++) {
    // where every ridgeline crosses this row (kept in order, never crossing)
    for (let k = 0; k < n; k++) {
      const L = lines[k];
      const dy = Math.max(0, y - L.y);
      let lx = L.x + dy * L.drift + (vnoise(dy * 0.2 + L.seed * 0.37, 16) - 0.5) * Math.min(6, dy * 0.3);
      if (k > 0 && lx < lineX[k - 1] + 1) lx = lineX[k - 1] + 1;
      lineX[k] = lx;
    }
    const a = c01((y - hazeTop) / (PEAK * 0.66));
    const hz = a * a * 0.6 + a * 0.4;
    let j = 0;
    for (let x = 0; x < W; x++) {
      const top = tops[x];
      if (y < top) continue;
      while (j < n && lineX[j] <= x) j++;
      // the nearest ridgeline on the left decides which way this face looks
      let leftFacing = n > 0 ? lines[0].kind === 1 : true;
      let near = Infinity;
      let nearKind = 0;
      if (j > 0) {
        nearKind = lines[j - 1].kind;
        leftFacing = nearKind === -1;
        near = x - lineX[j - 1];
      }
      // distance to the closest spine / gully on either side
      let spineD = nearKind === 1 ? near : Infinity;
      let gullyD = nearKind === -1 ? near : Infinity;
      if (j < n) {
        const dr = lineX[j] - x;
        if (lines[j].kind === 1) spineD = Math.min(spineD, dr);
        else gullyD = Math.min(gullyD, dr);
      }
      const lit = lightLeft ? leftFacing : !leftFacing;
      const depth = y - top;
      // snow clings to the ridges and slides out of the gullies
      const cling = spineD < 2 + depth * 0.22 ? PEAK * 0.12 : 0;
      const bare = gullyD < 1.5 + depth * 0.12 ? PEAK * 0.1 : 0;
      const isSnow =
        y < snowLine[x] + (lit ? streak[x] : 0) + cling - bare + (bayer4(x, y) - 0.5) * 4 &&
        !(depth > 1 && vnoise((x / U) * 240 + y * 0.05, 13) > 0.78);
      let c: RGB = isSnow ? (lit ? snow : snowShade) : lit ? rockLit : rock;
      let e = 0;
      // high up, the ridge itself catches the light and gullies sink into
      // shadow; lower down the haze swallows both
      if (depth < PEAK * 0.32) {
        if (lit && near < 1.5 && nearKind === 1) e = isSnow ? 0.45 : 0.22;
        else if (!lit && near < 1.5 && nearKind === -1 && !isSnow) c = deep;
      }
      if (depth === 0 && lit) e = isSnow ? 0.5 : 0.24;
      // aerial perspective: the lower slopes dissolve into the valley haze
      put2(s, x, y, c, edge, e, haze, q4(hz, x, y, 6) * 0.86);
    }
  }
}

function midPass(s: Scene) {
  const { W, H, S, U, P, haze, lightLeft, Ly } = s;
  const top = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const e = Math.abs(x / W - 0.5) * 2;
    const bump = hash2(x >> 1, 3, 5) > 0.7 ? 1 : 0; // treeline stipple
    top[x] = H * 0.738 - S * 0.055 * fbm((x / U) * 8, 21, 5) - S * 0.04 * Math.pow(e, 1.6) - bump;
  }
  const body = hex(P.mid.body);
  const rim = hex(P.mid.rim);
  const farm = mix(body, hex("#e0bd6e"), 0.5 + 0.45 * P.windows);
  for (let x = 0; x < W; x++) {
    const t = Math.ceil(top[x]);
    const facesRight = top[Math.min(W - 1, x + 2)] - top[Math.max(0, x - 2)] > 0;
    const litFace = lightLeft ? !facesRight : facesRight;
    for (let y = Math.max(0, t); y < Ly; y++) {
      const depth = y - t;
      const c = litFace && (depth === 0 || (depth === 1 && bayer4(x, y) < 0.4)) ? rim : body;
      const mist = c01((y - t - S * 0.01) / (S * 0.05));
      put2(s, x, y, c, haze, q4(Math.pow(mist, 1.3), x, y, 4) * 0.6, c, 0);
    }
    // farm lights scattered on the slopes
    if (P.windows > 0 && hash2(x, 9, 4) < 0.01) {
      const ly = t + 3 + Math.floor(hash2(x, 10, 4) * S * 0.03);
      if (ly < H * 0.775) put(s, x, ly, farm);
    }
  }
}

function nearPass(s: Scene) {
  const { W, H, S, U, P, haze, lightLeft, Ly, nearTop } = s;
  for (let x = 0; x < W; x++) {
    const u = x / U;
    let h = S * 0.01 * fbm(u * 14, 41, 4);
    for (const p of PUYS) {
      const t = Math.abs(x - p.x * W) / (p.w * U);
      if (t >= 1) continue;
      let b = S * p.h * Math.pow(1 - t * t, 1.4);
      if (p.crater && t < 0.2) b -= S * p.h * 0.16 * (1 - t / 0.2);
      h = Math.max(h, b + S * 0.005 * fbm(u * 40, 41, 4));
    }
    nearTop[x] = H * 0.792 - h;
  }
  const body = hex(P.near.body);
  const rim = hex(P.near.rim);
  for (let x = 0; x < W; x++) {
    const t = Math.ceil(nearTop[x]);
    const facesRight = nearTop[Math.min(W - 1, x + 2)] - nearTop[Math.max(0, x - 2)] > 0;
    const litFace = lightLeft ? !facesRight : facesRight;
    for (let y = Math.max(0, t); y < Ly; y++) {
      const c = y === t && litFace ? rim : body;
      const mist = c01((y - (Ly - S * 0.028)) / (S * 0.028));
      put2(s, x, y, c, haze, q4(mist, x, y, 3) * 0.45, c, 0);
    }
  }
}

function villagePass(s: Scene) {
  const { W, P, haze, lightLeft, Ly, nearTop, phase } = s;
  const vx = Math.round(VILLAGE_X * W);
  const count = Math.max(5, Math.min(13, Math.round(W / 38)));
  const night = P.windows > 0.5;
  const wall = mix(hex(P.wall), haze, phase === "day" ? 0.22 : 0.12);
  const wallLit = mix(wall, hex(P.far.edge), night ? 0.2 : 0.18);
  const roof = mix(hex(P.roof), haze, phase === "day" ? 0.18 : 0.05);
  const winA = hex("#e0bd6e");
  const winB = hex("#ffd9a3");
  const vr = mulberry32(0x5eed);
  const crestAt = (x: number) => Math.ceil(nearTop[ci(x, 0, W - 1)]);
  const houses: { x: number; w: number; h: number; kind: "house" | "church" | "keep" }[] = [];
  let cursor = vx - Math.round(count * 2.2);
  for (let k = 0; k < count; k++) {
    const kind = k === Math.floor(count * 0.42) ? "church" : k === count - 3 ? "keep" : "house";
    const w = kind === "church" ? 6 : kind === "keep" ? 3 : 3 + Math.floor(vr() * 3);
    const h = kind === "church" ? 4 : kind === "keep" ? 7 + Math.floor(vr() * 2) : 3 + Math.floor(vr() * 2);
    houses.push({ x: cursor, w, h, kind });
    cursor += w + (vr() < 0.25 ? 1 : 0);
  }
  // the town's own warm glow, hanging in the mist above the roofs
  if (P.windows > 0) {
    const gy0 = crestAt(vx) - 3;
    const gr = Math.max(10, count * 3.4);
    const ember = hex("#e0bd6e");
    for (let y = Math.floor(gy0 - gr * 0.6); y <= gy0 + gr * 0.4; y++) {
      for (let x = Math.floor(vx - gr); x <= vx + gr; x++) {
        const d = Math.hypot((x - vx) / gr, (y - gy0) / (gr * 0.55));
        if (d >= 1) continue;
        const q = q8((1 - d) ** 2 * 0.55 * P.windows, x, y, 4);
        if (q > 0) tint(s, x, y, ember, q * 0.22);
      }
    }
  }
  for (const hs of houses) {
    let base = 0;
    for (let x = hs.x; x < hs.x + hs.w; x++) base = Math.max(base, crestAt(x));
    base += 1; // sink into the hill
    const topY = base - hs.h;
    for (let y = topY; y < base; y++) {
      for (let x = hs.x; x < hs.x + hs.w; x++) {
        const litSide = lightLeft ? x === hs.x : x === hs.x + hs.w - 1;
        put(s, x, y, litSide ? wallLit : wall);
      }
    }
    if (hs.kind === "house") {
      for (let x = hs.x; x < hs.x + hs.w; x++) put(s, x, topY - 1, roof);
      for (let x = hs.x + 1; x < hs.x + hs.w - 1; x++) put(s, x, topY - 2, roof);
    } else if (hs.kind === "church") {
      for (let x = hs.x; x < hs.x + hs.w; x++) put(s, x, topY - 1, roof);
      const sx = hs.x + 1;
      for (let y = topY - 6; y < topY; y++) {
        put(s, sx, y, wallLit);
        put(s, sx + 1, y, wall);
      }
      put(s, sx, topY - 7, roof);
      put(s, sx + 1, topY - 7, roof);
      put(s, sx, topY - 8, roof);
      put(s, sx, topY - 9, roof);
      if (P.windows > 0) put(s, sx, topY - 4, winB);
    } else {
      put(s, hs.x, topY - 1, wall);
      put(s, hs.x + 2, topY - 1, wall);
      if (P.windows > 0) put(s, hs.x + 1, topY + 2, winA);
    }
    if (P.windows > 0 && hs.kind !== "keep") {
      for (let y = topY + 1; y < base - 1; y += 2) {
        for (let x = hs.x + 1; x < hs.x + hs.w - 1; x += 2) {
          if (vr() < P.windows) put(s, x, y, vr() < 0.35 ? winB : winA);
        }
      }
    }
  }
  // a road of street lamps winding down to the shore
  if (P.windows > 0) {
    const lamp = mix(hex(P.near.body), hex("#ffc27a"), 0.75);
    let x = vx - Math.round(count * 2.4);
    let y = crestAt(x) + 2;
    for (let step = 0; y < Ly - 2 && step < 40; step++) {
      if (step % 3 === 0) put(s, x, y, lamp);
      y += 1;
      x -= step % 2 === 0 ? 2 : 1;
    }
  }
}

function lakePass(s: Scene) {
  const { W, H, P, Ly, d } = s;
  const lake = hex(P.lake);
  const lakeHi = hex(P.lakeHi);
  const shore = hex(P.shore);
  const src: RGB = [0, 0, 0];
  for (let y = Ly; y < H; y++) {
    const dy = y - Ly;
    const depth = dy / Math.max(1, H - Ly);
    const sy = Ly - 1 - Math.round(dy * 1.15);
    const amp = 0.6 + dy * 0.09;
    const k = 0.38 + 0.4 * depth;
    for (let x = 0; x < W; x++) {
      // a rippled mirror: the reflected row wobbles sideways with depth
      const rx = Math.round((vnoise(y * 0.7 + x * 0.015, 61) - 0.5) * 2 * amp);
      if (sy >= 0) {
        const si = (sy * W + ci(x + rx, 0, W - 1)) * 4;
        src[0] = d[si];
        src[1] = d[si + 1];
        src[2] = d[si + 2];
      } else {
        src[0] = lake[0];
        src[1] = lake[1];
        src[2] = lake[2];
      }
      const lane = (dy + Math.floor(vnoise(x * 0.06 + y * 0.2, 62) * 3)) % 3 === 0;
      let hi = lane && bayer4(x, y) > 0.45 ? 0.18 + 0.12 * (1 - depth) : 0;
      let hiC = lakeHi;
      if (dy === 0) {
        hi = bayer4(x, y) < 0.75 ? 0.7 : 0.3;
        hiC = shore;
      } else if (dy === 1 && bayer4(x, y) < 0.3) {
        hi = 0.35;
        hiC = shore;
      }
      put2(s, x, y, src, lake, k, hiC, hi);
    }
  }
  if (!s.bodyVisible) return;
  // the glitter path: broken dashes widening toward the viewer
  const glint = hex(P.glint);
  const isSun = P.body === "sun";
  const big = isSun ? 1.4 : 1;
  const power = isSun ? (s.phase === "day" ? 0.75 : 0.9) : 0.25 + 0.6 * s.moonLit;
  for (let y = Ly + 2; y < H; y += 2) {
    const dy = y - Ly;
    const half = (1.2 + dy * 0.2) * big;
    for (let x = Math.floor(s.bx - half); x <= s.bx + half; x++) {
      const off = Math.abs(x + 0.5 - s.bx) / half;
      if (off > 1 || hash2(x >> 1, y, 91) > 0.25 + (1 - off) * 0.5) continue;
      tint(s, x, y, glint, (0.9 - off * 0.6) * power * (1 - (dy / (H - Ly)) * 0.4));
    }
  }
}

function forePass(s: Scene) {
  const { W, H, S, U, P, lightLeft, foreTop } = s;
  for (let x = 0; x < W; x++) {
    const e = Math.abs(x / W - 0.5) * 2;
    foreTop[x] = H * (1.06 - 0.25 * smoothstep(0.3, 1, e)) + (fbm((x / U) * 12, 71, 4) - 0.5) * S * 0.035;
  }
  const body = hex(P.fore.body);
  const rim = hex(P.fore.rim);
  for (let x = 0; x < W; x++) {
    const t = Math.ceil(foreTop[x]);
    for (let y = Math.max(0, t); y < H; y++) {
      put(s, x, y, y === t || (y === t + 1 && bayer4(x, y) < 0.35) ? rim : body);
    }
  }
  // pines along the banks: tiered silhouettes, lit on the light's side
  const pr = mulberry32(0x9172);
  let x = 0;
  while (x < W) {
    x += 2 + Math.floor(pr() * 4);
    const base = Math.ceil(foreTop[ci(x, 0, W - 1)]);
    const roll = pr();
    if (base >= H - 2) continue;
    const tall = Math.round(S * (0.018 + roll * 0.04) * (0.6 + 0.6 * c01((H - base) / (H * 0.2))));
    if (tall < 3) continue;
    for (let k = 0; k <= tall; k++) {
      const y = base - tall + k;
      const hw = Math.floor(((k % 3) * 0.5 + k * 0.24) * 0.75);
      for (let dx = -hw; dx <= hw; dx++) put(s, x + dx, y, body);
      if (hw > 0 && k % 3 === 2 && pr() < 0.7) put(s, lightLeft ? x - hw : x + hw, y, rim);
    }
    put(s, x, base - tall - 1, body);
  }
}

function vignettePass(s: Scene) {
  const { W, H, P } = s;
  const vig = hex(P.vignette);
  const topBand = H * 0.14;
  const botBand = H * 0.2;
  const side = new Float32Array(W);
  // the floor eases off in the middle, where the dock floats: its glass
  // needs the pines and the lake's light under it to have something to bend
  const floor = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const e = Math.abs(x / W - 0.5) * 2;
    side[x] = Math.pow(e, 3) * 0.12;
    floor[x] = 0.4 + 0.6 * smoothstep(0.15, 0.7, e);
  }
  for (let y = 0; y < H; y++) {
    const vt = y < topBand ? Math.pow(1 - y / topBand, 1.6) * 0.32 : 0;
    const vb = y > H - botBand ? Math.pow((y - (H - botBand)) / botBand, 1.5) * 0.42 : 0;
    for (let x = 0; x < W; x++) {
      const v = Math.min(0.6, vt + vb * floor[x] + side[x]);
      if (v > 0.01) tint(s, x, y, vig, q8(v, x, y, 8));
    }
  }
}

/* ───────────────────────────── public API ───────────────────────────── */

export type Life = {
  /** art-pixel coordinates of a few bright stars that glint via CSS */
  twinkles: { x: number; y: number; c: string; d: number; delay: number }[];
  plane: { y: number; day: boolean } | null;
  meteor: { x: number; y: number } | null;
};

export type PaintOpts = {
  W: number;
  H: number;
  phase: SkyPhase;
  /** Paris hour, fractional, already coherent with the phase */
  hour: number;
  /** synodic moon phase 0..1 (0 new, 0.5 full) */
  moon: number;
};

/** Synodic moon phase for a date: 0 = new, 0.5 = full. */
export function moonPhase(d: Date) {
  const ref = Date.UTC(2000, 0, 6, 18, 14); // a known new moon
  const p = ((d.getTime() - ref) / 86400000 / 29.530588853) % 1;
  return p < 0 ? p + 1 : p;
}

/** Where the sun or moon sits for a phase/hour: a U-shaped arc hugging the
    sides, so the upper middle stays free for the wordmark. */
function celestial(phase: SkyPhase, hour: number) {
  const p = phase === "night" ? (((hour - 20.5 + 24) % 24) / 10) % 1 : (hour - 6.25) / 14;
  const sn = Math.sin(Math.PI * p);
  const cs = Math.cos(Math.PI * p);
  return { x: 0.5 - 0.44 * Math.sign(cs) * Math.pow(Math.abs(cs), 0.6), alt: sn <= 0 ? sn : Math.sqrt(sn) };
}

/** Paint the scene into a fresh RGBA buffer (worker-safe: no DOM). */
export function paintPixels(o: PaintOpts): { pixels: Uint8ClampedArray<ArrayBuffer>; life: Life } {
  const { W, H, phase } = o;
  const P = PHASES[phase];
  // vertical budget: on tall phone screens the range keeps a sane aspect
  const S = Math.min(H, W * 1.05);
  const Hz = Math.round(H * 0.7);
  const body = celestial(phase, o.hour);
  // a new moon would be invisible: keep at least a fine crescent
  const moon = o.moon < 0.14 ? 0.14 : o.moon > 0.86 ? 0.86 : o.moon;

  // the sky ramp: 20 steps sampled from the phase stops
  const ramp: RGB[] = [];
  for (let k = 0; k < 20; k++) {
    const t = k / 19;
    let j = 0;
    while (j < P.sky.length - 2 && t > P.sky[j + 1][0]) j++;
    const [t0, c0] = P.sky[j];
    const [t1, c1] = P.sky[j + 1];
    ramp.push(mix(hex(c0), hex(c1), c01((t - t0) / (t1 - t0))));
  }

  const s: Scene = {
    d: new Uint8ClampedArray(W * H * 4),
    W,
    H,
    phase,
    P,
    S,
    U: Math.max(W, S * 1.5),
    Hz,
    Ly: Math.round(H * 0.808),
    PEAK: S * 0.3,
    bx: Math.round(body.x * W),
    by: Math.round(Hz - body.alt * (Hz - H * 0.11)),
    lightLeft: body.x < 0.5,
    bodyVisible: body.alt > -0.08,
    moon,
    moonLit: (1 - Math.cos(2 * Math.PI * moon)) / 2,
    ramp,
    haze: hex(P.haze),
    skyLum: new Float32Array(W * Hz),
    nearTop: new Float32Array(W),
    foreTop: new Float32Array(W),
    twinkles: [],
  };

  skyPass(s);
  milkyPass(s);
  starsPass(s);
  cloudsPass(s);
  bodyPass(s);
  ghostPass(s);
  farPass(s);
  midPass(s);
  nearPass(s);
  villagePass(s);
  lakePass(s);
  forePass(s);
  vignettePass(s);

  // life: a few elements the CSS layer animates
  const twinkles: Life["twinkles"] = [];
  if (s.twinkles.length) {
    const outside = s.twinkles.filter((t) => !calm(s, t.x, t.y));
    const pool = outside.length >= 3 ? outside : s.twinkles;
    const byB = [...pool].sort((a, b) => b.b - a.b);
    const picks = [0, 1, 2].map((k) => byB.find((t) => t.x >= (k * W) / 3 && t.x < ((k + 1) * W) / 3));
    picks.push(byB.find((t) => !picks.includes(t)));
    picks.forEach((t, k) => {
      if (t) twinkles.push({ x: t.x, y: t.y, c: t.c, d: 3.2 + k * 0.9, delay: k * 1.3 });
    });
  }
  return {
    pixels: s.d,
    life: {
      twinkles,
      plane: { y: Math.round(H * (0.13 + hash2(W, H, 3) * 0.05)), day: phase === "day" },
      meteor: phase === "day" ? null : { x: Math.round(W * 0.7), y: Math.round(H * 0.075) },
    },
  };
}

/** Main-thread convenience: paint straight into a 2D context. */
export function paintWallpaper(ctx: CanvasRenderingContext2D, o: PaintOpts): Life {
  const { pixels, life } = paintPixels(o);
  ctx.putImageData(new ImageData(pixels, o.W, o.H), 0, 0);
  return life;
}
