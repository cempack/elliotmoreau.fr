import { WORDMARK_BAND_ROWS, WORDMARK_BANDS } from "./pixelword";

// Tiny terminal-text-effect engine in the spirit of ttfx/terminaltexteffects:
// an effect runs over a grid of character cells and hands back a symbol +
// a colour per cell each frame; the caller paints them. Clean-room take on
// the classics (decrypt / matrix / sweep) for short single-line labels.

export type TtfxEffect = "decrypt" | "matrix" | "sweep";
export type TtfxTone = "bone" | "ember" | "glacier" | "sage";

const GLYPHS = [..."アイウエオカキクケコサシスセソ0123456789XYZ<>*+#$%&@?/\\|"];

// Moss resting inks for flat labels: bone is the paper-white text
// colour, so a settled label hands back to plain text without a shift
const LOCKED: Record<TtfxTone, string> = {
  bone: "#EBE9E1",
  ember: "#E0BD6E",
  glacier: "#89B4A8",
  sage: "#B0CC86",
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Grid-scale engine: screensaver-style effects over a wordmark bitmap. */
/* ------------------------------------------------------------------ */

export type GridEffect =
  | "grid-decrypt"
  | "grid-matrix"
  | "grid-laser"
  | "grid-blackhole"
  | "grid-waves"
  | "grid-beams"
  | "grid-rings"
  | "grid-spotlights"
  | "grid-fireworks"
  | "grid-colorshift"
  | "grid-prism";
export const GRID_EFFECTS: GridEffect[] = [
  "grid-decrypt",
  "grid-matrix",
  "grid-laser",
  "grid-blackhole",
  "grid-waves",
  "grid-beams",
  "grid-rings",
  "grid-spotlights",
  "grid-fireworks",
  "grid-colorshift",
  "grid-prism",
];

export type Bitmap = { cols: number; rows: number; lit: Uint8Array; chars: string[] };

/** Single-row bitmap straight from a mono label — no sampling needed. */
export function textBitmap(text: string): Bitmap {
  const chars = [...text];
  return {
    cols: Math.max(chars.length, 1),
    rows: 1,
    lit: Uint8Array.from(chars.map((c) => (c === " " || c === " " ? 0 : 1))),
    chars,
  };
}

/* ------------------------------------------------------------------ */
/* Hero field: omarchy-landing-style composite loop.                    */
/* One canvas, three layers every frame:                                */
/*  1. ambient lattice — drifting value-noise + twinkle, Bayer-dithered */
/*     into sparse moss/sage cells;                                     */
/*  2. wordmark — a full-grid ttfx effect that etches the bitmap, then  */
/*     rests in per-row gradient bands;                                 */
/*  3. light — the raw pointer (unsmoothed, eased strength) plus an     */
/*     autonomous wandering sprite lift nearby cells to green.          */
/* The loop never ends: effect, hold, next effect. Pause off-screen,    */
/* die under reduced motion (the caller gates both).                    */
/* ------------------------------------------------------------------ */

const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
  14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
];

const FIELD = {
  bg: [0, 0, 0, 0] as const, // transparent: the page shows through
  dim: "#1E2A26", // moss lattice
  mid: "#4E6A60", // sage dusk
  lit: "#EBE9E1", // paper white
  hover: "#B0CC86", // moss under the light
  crest: "#E3EED2", // white-hot moss
  extrude: "#050807", // far step of the in-canvas 3D solid, receding up-back
  extrudeNear: "#1B2A26", // near step: deep moss sides
  extrudeTop: "#FBF9F4", // top-face light on skyline edges
};

// Moss lights: disturbance frontiers wear every accent — flare, ember,
// signal, lilac, ion — over paper white.
const THEME = {
  red: "#E2786B",
  green: "#B0CC86",
  yellow: "#E0BD6E",
  blue: "#AEA3C8",
  cyan: "#89B4A8",
  bone: "#EBE9E1",
};
const BRIGHTS = [THEME.red, THEME.yellow, THEME.green, THEME.blue, THEME.cyan, THEME.bone];

// every effect wears its own rest identity: five inks over the shared
// band counts, all pulled from Moss (paper crest, a lit middle, an
// indigo foot) — so no two effects ever rest in the same colours.
// Decrypt is the canonical stack (WORDMARK_BANDS): the entrance hands off
// from the SSR wordmark without a colour jump.
type Palette = [string, string, string, string, string];
const PALETTES: Record<GridEffect, Palette> = {
  "grid-decrypt": ["#EBE9E1", "#B0CC86", "#8FC2A8", "#6F8FA0", "#3B4F5A"],
  "grid-matrix": ["#EBE9E1", "#B0CC86", "#86A35C", "#4E6A60", "#2C3D38"],
  "grid-laser": ["#EBE9E1", "#BCC2BA", "#89B4A8", "#4E6A60", "#2C3D38"],
  "grid-blackhole": ["#EBE9E1", "#B0CC86", "#E2786B", "#6A8A7A", "#2C3D38"],
  "grid-waves": ["#EBE9E1", "#89B4A8", "#AEA3C8", "#5E7F75", "#2C3D38"],
  "grid-beams": ["#EBE9E1", "#E3EED2", "#B0CC86", "#4E6A60", "#2C3D38"],
  "grid-rings": ["#EBE9E1", "#AEA3C8", "#B0CC86", "#5E7F75", "#2C3D38"],
  "grid-spotlights": ["#EBE9E1", "#E0BD6E", "#B0CC86", "#4E6A60", "#2C3D38"],
  "grid-fireworks": ["#EBE9E1", "#B0CC86", "#E0BD6E", "#4E6A60", "#2C3D38"],
  "grid-colorshift": ["#EBE9E1", "#B0CC86", "#89B4A8", "#AEA3C8", "#2C3D38"],
  "grid-prism": ["#EBE9E1", "#EBE9E1", "#E2786B", "#89B4A8", "#2C3D38"],
};
const stopsFrom = (pal: Palette): [number, string][] =>
  WORDMARK_BANDS.map(([n], k) => [n, pal[k]] as [number, string]);
const STOP_SETS: Record<GridEffect, [number, string][]> = Object.fromEntries(
  (Object.keys(PALETTES) as GridEffect[]).map((e) => [e, stopsFrom(PALETTES[e])])
) as Record<GridEffect, [number, string][]>;
// fireworks rests rainbow: one bright per band row, cycling the theme
STOP_SETS["grid-fireworks"] = Array.from(
  { length: WORDMARK_BAND_ROWS },
  (_, i) => [1, BRIGHTS[i % BRIGHTS.length]] as [number, string]
);
const palInk = (stops: [number, string][], band: number): string => {
  let acc = 0;
  for (const [count, ink] of stops) {
    acc += count;
    if (band < acc) return ink;
  }
  return stops[stops.length - 1][1];
};

const NOISE_N = 48;

function makeNoise(): Float32Array {
  const g = new Float32Array(NOISE_N * NOISE_N);
  for (let i = 0; i < g.length; i++) g[i] = Math.random();
  return g;
}

function sampleNoise(g: Float32Array, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % NOISE_N) + NOISE_N) % NOISE_N;
  const y0 = ((yi % NOISE_N) + NOISE_N) % NOISE_N;
  const x1 = (x0 + 1) % NOISE_N;
  const y1 = (y0 + 1) % NOISE_N;
  const a = g[y0 * NOISE_N + x0];
  const b = g[y0 * NOISE_N + x1];
  const c = g[y1 * NOISE_N + x0];
  const d = g[y1 * NOISE_N + x1];
  return a + (b - a) * sx + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

let lastHeroEffect: GridEffect | "" = "";
const recentHeroEffects: GridEffect[] = [];

export type HeroFieldOpts = {
  ambient?: boolean; // drifting lattice behind the word (default true)
  sprite?: boolean; // wandering light next to the pointer (default true)
  effects?: GridEffect[]; // cycle pool (default all)
  dur?: number; // one effect run, ms (default 2000)
  hold?: number; // resting beat between runs, ms (default 1050)
  restTone?: TtfxTone; // flat resting ink instead of gradient bands
  restGlyph?: "block" | "char"; // pixel blocks or real characters (default block)
  once?: boolean; // run one effect, rest, then fire onDone and stop
  onDone?: () => void;
  motes?: boolean; // drifting background pixel dust, omarchy-style (default false)
  /** Row spans that each wear the full band gradient (default: lit extent). */
  bands?: { from: number; to: number }[];
  /** Voxel relief: every settled cell gains a dark solid receding
      up-back plus a lit top face on skyline edges — tracks effects
      (default false — labels stay flat). */
  extrude?: boolean;
  /** Resting translucency gradient: the wordmark always rests ghostly,
      dissolving left (this alpha) to right (restGhost), like text sunk
      in the dark. 1 = fully solid (default). */
  restFade?: number;
  /** Right-end resting alpha (default: restFade). Lower = deeper dissolve. */
  restGhost?: number;
  /** Resting cells inset one unit so every pixel reads as its own little
      cube with dark grout between tiles, plus a whisper of per-cell shade
      variation (default false — labels stay seamless). */
  restGrout?: boolean;
  /** Permanent soft light wash hugging the wordmark, like the load
      animation's glow frozen in place: 0 = off (default), 1 = full. */
  restSheen?: number;
};

export function playHeroField(
  canvas: HTMLCanvasElement,
  map: Bitmap,
  opts: HeroFieldOpts = {}
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const { cols, rows, lit, chars } = map;
  const {
    ambient = true,
    sprite = true,
    effects = GRID_EFFECTS,
    dur: DUR = 2000,
    hold: HOLD = 1050,
    restTone,
    restGlyph = "block",
    once = false,
    onDone,
    motes: motesOn = false,
    bands,
    extrude: extrudeOn = false,
    restFade = 1,
    restGhost = restFade,
    restGrout = false,
    restSheen = 0,
  } = opts;
  const fadeOn = restFade < 1 || restGhost < 1;
  const restFlat = restTone ? LOCKED[restTone] : null;

  // dpr capped at 1: the field is chunky pixel rects, so extra backing
  // pixels only tax the rasterizer (2.25x at 1.5) without visible gain
  const dpr = 1;
  const W = Math.max(canvas.clientWidth, 1);
  const H = Math.max(canvas.clientHeight, 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cellW = W / cols;
  const cellH = H / rows;
  const px = Math.max(6, Math.min(cellW, cellH) * 1.25);
  ctx.font = `${px}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const rand = mulberry32((Math.random() * 0xffffffff) >>> 0);
  const pick = () => GLYPHS[(rand() * GLYPHS.length) | 0];
  const noiseA = makeNoise();
  const noiseB = makeNoise();
  const twPhase = Array.from({ length: cols * rows }, () => rand() * Math.PI * 2);
  const litCells: number[] = [];
  for (let i = 0; i < lit.length; i++) if (lit[i] === 1) litCells.push(i);

  // exterior air: flood fill from the borders through unlit cells, so the
  // relief only builds against open sky — counters stay clean dark holes
  const sky = new Uint8Array(cols * rows);
  {
    const stack: number[] = [];
    for (let c = 0; c < cols; c++) stack.push(c, (rows - 1) * cols + c);
    for (let r = 0; r < rows; r++) stack.push(r * cols, r * cols + cols - 1);
    while (stack.length > 0) {
      const i = stack.pop() as number;
      if (i < 0 || i >= cols * rows || sky[i] || lit[i]) continue;
      sky[i] = 1;
      const cc = i % cols;
      const rr = (i / cols) | 0;
      if (cc > 0) stack.push(i - 1);
      if (cc < cols - 1) stack.push(i + 1);
      if (rr > 0) stack.push(i - cols);
      if (rr < rows - 1) stack.push(i + cols);
    }
  }
  const isSky = (c: number, r: number) =>
    c < 0 || c >= cols || r < 0 || r >= rows || sky[r * cols + c] === 1;

  // frosted-rest tables, baked once: column brushing + per-cell grain are
  // pure functions of (c, r), so no sin() calls survive in the hot loop
  const streakCol = new Float32Array(cols);
  for (let c = 0; c < cols; c++) {
    const s = Math.sin(c * 12.9 + 3.7) * 24634.63;
    streakCol[c] = 0.8 + 0.2 * (s - Math.floor(s));
  }
  const grainCell = new Float32Array(cols * rows);
  const cubeCell = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h = Math.sin(c * 127.1 + r * 311.7) * 43758.5453;
      const f = h - Math.floor(h);
      grainCell[r * cols + c] = 0.92 + 0.08 * f;
      cubeCell[r * cols + c] = 0.93 + 0.07 * f;
    }
  }
  // sheen gradient cache: unit-space, depends only on restSheen — the
  // bbox is fixed per playHeroField run (resize restarts the run)
  let sheenAmt = -1;
  let sheenGrad: CanvasGradient | null = null;

  // scattered background pixel dust: sparse chunky squares that drift and
  // twinkle behind the word, brighter ones in green
  type Mote = { fx: number; fy: number; big: boolean; ph: number; sp: number; tone: number };
  const motes: Mote[] = motesOn
    ? Array.from({ length: 44 }, () => ({
        fx: rand(),
        fy: rand(),
        big: rand() < 0.25,
        ph: rand() * Math.PI * 2,
        sp: 0.3 + rand() * 0.7,
        tone: rand(),
      }))
    : [];

  // banded wordmark gradient in omarchy's 5/2/4/3/5 laser-band proportions —
  // the canonical stack lives in pixelword.ts (the SSR wordmark wears it
  // too, so first paint and live frames share one gradient). Bands map to
  // the lit extent, not the grid.
  let minLitRow = rows;
  let maxLitRow = -1;
  let minLitCol = cols;
  let maxLitCol = -1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (lit[r * cols + c] === 1) {
        if (r < minLitRow) minLitRow = r;
        if (r > maxLitRow) maxLitRow = r;
        if (c < minLitCol) minLitCol = c;
        if (c > maxLitCol) maxLitCol = c;
      }
    }
  }
  // each span wears the full gradient (a two-line word gets two rainbows,
  // not one stretched across both); uncovered rows fall back to the extent
  const spans =
    bands && bands.length > 0 ? bands : [{ from: minLitRow, to: maxLitRow }];
  const bandOfRow: number[] = [];
  for (let r = 0; r < rows; r++) {
    const covering = spans.find((s) => r >= s.from && r <= s.to);
    const lo = covering ? covering.from : minLitRow;
    const hi = covering ? covering.to : maxLitRow;
    bandOfRow.push(
      Math.min(
        WORDMARK_BAND_ROWS - 1,
        Math.floor(((r - lo) / Math.max(1, hi - lo)) * WORDMARK_BAND_ROWS)
      )
    );
  }
  const drawRest = (x: number, y: number, i: number, grout: boolean) => {
    if (restGlyph === "char" && chars[i] && chars[i] !== " ") {
      ctx.fillText(chars[i], x, y);
    } else if (grout) {
      // tiled cells inset one unit: dark grout seams so every pixel reads
      // as its own little cube; seamless unless opted in
      ctx.fillRect(x - cellW / 2 + 0.5, y - cellH / 2 + 0.5, cellW - 1, cellH - 1);
    } else {
      // full-alpha labels butt joint-to-joint, no grout: slight overdraw
      // so fractional cells never seam, overdrawn ink is invisible
      ctx.fillRect(x - cellW / 2, y - cellH / 2, cellW + 0.5, cellH + 0.5);
    }
  };

  // light: raw pointer + wandering sprite, eased strengths
  const host = canvas.parentElement;
  const cursor = { x: -1e4, y: -1e4, s: 0, ts: 0 };
  const dot = { x: W / 2, y: H / 2, s: 0 };
  const onMove = (e: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    cursor.x = e.clientX - box.left;
    cursor.y = e.clientY - box.top;
    cursor.ts = 1;
  };
  const onLeave = () => {
    cursor.ts = 0;
  };
  host?.addEventListener("pointermove", onMove, { passive: true });
  host?.addEventListener("pointerleave", onLeave);

  const forced = (): GridEffect | null => {
    try {
      const f = new URLSearchParams(window.location.search).get("fx") as GridEffect | null;
      return f && effects.includes(f) ? f : null;
    } catch {
      return null;
    }
  };
  const pickEffect = (): GridEffect => {
    const pinned = forced();
    if (pinned) return pinned;
    // no repeats, and no almost-repeats: the last four runs are excluded
    // from the draw. Small single-effect label pools skip the history and
    // just avoid an immediate repeat like before.
    const pool =
      effects.length > 3
        ? effects.filter((e) => !recentHeroEffects.includes(e))
        : effects.filter((e) => e !== lastHeroEffect);
    const e = (pool.length > 0 ? pool : effects)[(Math.random() * (pool.length || 1)) | 0] ?? effects[0];
    lastHeroEffect = e;
    if (effects.length > 3) {
      recentHeroEffects.push(e);
      if (recentHeroEffects.length > 4) recentHeroEffects.shift();
    }
    return e;
  };

  const HEAD_START = DUR * 0.35;
  type Cycle = {
    effect: GridEffect;
    t0: number;
    scratch: string[];
    lockAt: Float32Array;
    colDelay: Float32Array;
    bursts: { x: number; y: number; t0: number; color: string }[];
  };
  let cycle: Cycle | null = null;
  let holding = false;
  let holdStart = 0;

  let firstCycle = true;
  const startCycle = (now: number) => {
    // the entrance always etches the word in with a decrypt resolve,
    // unless an effect is pinned (or decrypt isn't in the pool)
    const pinned = forced();
    const effect =
      pinned ?? (firstCycle && effects.includes("grid-decrypt") ? "grid-decrypt" : pickEffect());
    firstCycle = false;
    const scratch = Array.from({ length: cols * rows }, () => pick());
    const lockAt = new Float32Array(cols * rows).fill(Infinity);
    const colDelay = new Float32Array(cols);
    for (let c = 0; c < cols; c++) colDelay[c] = rand() * DUR * 0.25;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (!lit[i]) continue;
        if (effect === "grid-decrypt") {
          // diagonal scan position; cells resolve as the front passes
          lockAt[i] = ((c / cols) * 0.7 + (r / rows) * 0.3) * DUR * 0.6;
        } else if (effect === "grid-matrix") {
          lockAt[i] = colDelay[c] - HEAD_START + 200 + (r / rows) * DUR * 0.62;
        }
      }
    }
    // fireworks: staggered bursts pinned to lit cells, each blooming in a
    // rotating theme bright
    const bursts: Cycle["bursts"] = [];
    if (effect === "grid-fireworks" && litCells.length > 0) {
      for (let b = 0; b < 5; b++) {
        const li = litCells[(rand() * litCells.length) | 0];
        bursts.push({
          x: cellW * ((li % cols) + 0.5),
          y: cellH * (((li / cols) | 0) + 0.5),
          t0: 100 + (b * DUR * 0.5) / 5,
          color: BRIGHTS[b % BRIGHTS.length],
        });
      }
    }
    cycle = { effect, t0: now, scratch, lockAt, colDelay, bursts };
    holding = false;
  };

  let raf = 0;
  let lastFrame = 0;
  let lastShuffle = 0;
  let dead = false;

  const glowAt = (x: number, y: number): number => {
    // squared distances: the sqrt runs only for cells inside a light's
    // radius (a handful per frame), not for all 12k cells. Same falloff.
    let g = 0;
    const reach = Math.min(W, H) * 0.22;
    if (cursor.s > 0.01) {
      const dx = x - cursor.x;
      const dy = y - cursor.y;
      const dc2 = dx * dx + dy * dy;
      if (dc2 < reach * reach) {
        const f = 1 - Math.sqrt(dc2) / reach;
        g = f * f * cursor.s;
      }
    }
    if (sprite && dot.s > 0.01) {
      const dx = x - dot.x;
      const dy = y - dot.y;
      const ds2 = dx * dx + dy * dy;
      const sr = Math.min(W, H) * 0.16;
      if (ds2 < sr * sr) {
        const f = 1 - Math.sqrt(ds2) / sr;
        const gs = f * f * dot.s;
        if (gs > g) g = gs;
      }
    }
    return g;
  };

  const frame = (now: number) => {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    // the hold is ambient drift — 20fps is invisible, 40fps only while an
    // effect is live. Same throttle philosophy as the PixelSky backdrop.
    if (now - lastFrame < (holding ? 50 : 25)) return;
    lastFrame = now;
    const tSec = now / 1000;

    cursor.s += (cursor.ts - cursor.s) * 0.3;
    if (sprite) {
      dot.x = W * (0.5 + 0.42 * Math.sin(tSec * 0.78));
      dot.y = H * (0.5 + 0.36 * Math.sin(tSec * 0.58 + 1.1));
      dot.s += (0.7 - dot.s) * 0.05;
    }

    if (!cycle) startCycle(now);
    const cy = cycle!;
    const t = now - cy.t0;

    if (now - lastShuffle > 70) {
      lastShuffle = now;
      for (let i = 0; i < cy.scratch.length; i++) cy.scratch[i] = pick();
    }

    // completion → hold → next cycle
    let alive = false;
    if (cy.effect === "grid-decrypt") {
      alive = t < DUR * 0.75;
    } else if (cy.effect === "grid-matrix") {
      alive = t < DUR * 0.95;
    } else if (cy.effect === "grid-rings") {
      alive = t < DUR * 0.97;
    } else if (cy.effect === "grid-laser") {
      alive = t < DUR * 0.75;
    } else if (cy.effect === "grid-blackhole") {
      alive = t < DUR * 0.9;
    } else if (cy.effect === "grid-waves") {
      alive = t < DUR * 0.85;
    } else if (cy.effect === "grid-fireworks") {
      alive = t < DUR * 0.95;
    } else if (cy.effect === "grid-colorshift") {
      alive = t < DUR * 0.9;
    } else if (cy.effect === "grid-prism") {
      alive = t < DUR * 0.8;
    } else {
      alive = t < DUR * 0.8;
    }
    if (!alive && !holding) {
      holding = true;
      holdStart = now;
    }
    if (holding && now - holdStart > HOLD) {
      if (once) {
        cleanup();
        try {
          onDone?.();
        } catch {
          /* listener-side */
        }
        return;
      }
      startCycle(now);
    }

    // travelling fronts (positional, so holds never snap)
    const beamX = cy.effect === "grid-beams" ? -0.08 * W + (t / (DUR * 0.72)) * 1.28 * W : -Infinity;
    const prismX = cy.effect === "grid-prism" ? -0.08 * W + (t / (DUR * 0.72)) * 1.28 * W : -Infinity;
    // colorshift sloshes the whole band gradient down and back to rest — a
    // sine round-trip, so the hold lands exactly on rest with no snap
    const shiftSteps =
      cy.effect === "grid-colorshift" && !holding
        ? Math.round(9 * Math.sin((2 * Math.PI * Math.min(t, DUR * 0.9)) / (DUR * 0.9)))
        : 0;
    const laserY = -0.05 * H + (t / (DUR * 0.7)) * 1.15 * H;
    const ccx = W / 2;
    const ccy = H / 2;
    const maxR = Math.hypot(W, H) * 0.62;
    const ringFront = (k: number) => (t / DUR - k * 0.16) * maxR * 1.25;
    const bandX = (ph: number) => -0.3 * W + ((t / DUR - ph) / 0.62) * 1.6 * W;
    const diag = (x: number, y: number) => x * 0.906 + y * 0.423;
    const scanPos = (c: number, r: number) => (c / cols) * 0.7 + (r / rows) * 0.3;
    const scanFront = -0.1 + (t / (DUR * 0.6)) * 1.2;

    ctx.clearRect(0, 0, W, H);

    if (motesOn) {
      for (const m of motes) {
        const wrap = (v: number) => ((v % 1) + 1) % 1;
        const mx = wrap(m.fx + 0.035 * Math.sin(tSec * 0.12 * m.sp + m.ph)) * W;
        const my = wrap(m.fy + 0.03 * Math.cos(tSec * 0.1 * m.sp + m.ph * 1.7)) * H;
        const tw = 0.5 + 0.5 * Math.sin(tSec * (0.5 + m.sp * 0.7) + m.ph * 2);
        ctx.globalAlpha = 0.07 + 0.3 * tw * tw;
        // mostly brass and moss, with red / blue / cyan motes sprinkled in
        ctx.fillStyle =
          m.tone < 0.12
            ? THEME.red
            : m.tone < 0.2
              ? THEME.blue
              : m.tone < 0.27
                ? THEME.cyan
                : m.tone < 0.45
                  ? FIELD.hover
                  : m.tone < 0.72
                    ? FIELD.mid
                    : FIELD.dim;
        const sz = Math.max(2.5, cellW * 0.85) * (m.big ? 2 : 1);
        ctx.fillRect(mx - sz / 2, my - sz / 2, sz, sz);
      }
      ctx.globalAlpha = 1;
    }

    // rows paint bottom-up: the up-back extrusion tucks behind the face
    // above it (cells are otherwise order-independent)
    for (let r = rows - 1; r >= 0; r--) {
      const y = cellH * (r + 0.5);
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const x = cellW * (c + 0.5);
        const isLit = lit[i] === 1;
        const glow = glowAt(x, y);

        if (!isLit) {
          if (!ambient) continue;
          // ambient lattice: drifting noise + twinkle through Bayer
          const nx = ((x / W) * 2 - 1 + 1) * 3;
          const ny = ((y / H) * 2 - 1 + 1) * 3;
          const base =
            0.6 * sampleNoise(noiseA, nx + tSec * 0.14, ny - tSec * 0.055) +
            0.4 * sampleNoise(noiseB, nx * 0.55 - tSec * 0.08, ny * 0.55 + tSec * 0.06);
          const tw = 0.5 + 0.5 * Math.sin(tSec * 1.1 + twPhase[i]);
          let lum = 0.42 * (0.3 + 0.52 * base * base + 0.18 * tw);
          lum += glow * 0.9;
          const thr = 0.3 + 0.55 * ((BAYER[(r & 7) * 8 + (c & 7)] + 0.5) / 64);
          if (lum <= thr) continue;
          ctx.fillStyle = glow > 0.3 ? FIELD.hover : glow > 0.08 ? FIELD.mid : FIELD.dim;
          ctx.globalAlpha = Math.min(1, 0.25 + lum);
          ctx.fillRect(x - cellW / 2, y - cellH / 2, cellW - 0.5, cellH - 0.5);
          continue;
        }

        // wordmark cell: resting ink, disturbed by the travelling front.
        // frontiers wear theme inks (hotInk), celebrations paint flat theme
        // blocks over rest (flatInk + flatAlpha).
        let hot = false;
        let dim = false;
        let ox = 0;
        let oy = 0;
        let hotInk = FIELD.hover;
        let flatInk: string | null = null;
        let flatAlpha: number | null = null;
        if (!holding) {
          if (cy.effect === "grid-decrypt") {
            const d = scanFront - scanPos(c, r);
            if (d < 0) dim = true;
            else if (d < 0.09) hot = true;
          } else if (cy.effect === "grid-matrix") {
            hotInk = THEME.green;
            const headRow = ((t + HEAD_START - cy.colDelay[c]) / (DUR * 0.62)) * rows - 2;
            const dist = headRow - r;
            if (t < cy.lockAt[i]) {
              if (dist > -9 && dist < 1.5) hot = true;
              else dim = true;
            } else if (dist < 2.5) {
              hot = true;
            }
          } else if (cy.effect === "grid-beams") {
            const near = Math.abs(beamX - x) / (W * 0.1);
            if (beamX <= x) dim = near > 1;
            hot = near <= 1;
          } else if (cy.effect === "grid-rings") {
            const d = Math.hypot(x - W / 2, y - H / 2);
            const fronts = [ringFront(0), ringFront(1), ringFront(2)];
            const near = fronts.some((f) => Math.abs(f - d) < cellW * 4);
            const passed = fronts.some((f) => f > d);
            hot = near;
            dim = !passed && !near;
          } else if (cy.effect === "grid-laser") {
            // etching scanline falls top to bottom: resolved above the beam,
            // white-hot cipher inside it, dormant below
            hotInk = THEME.bone;
            const dl = (laserY - y) / (cellH * 2);
            if (dl > 1) {
              // etched: resting ink
            } else if (dl > -1) {
              hot = true;
            } else {
              dim = true;
            }
          } else if (cy.effect === "grid-blackhole") {
            // the word collapses toward the middle, then resolves outward
            const d = Math.hypot(x - ccx, y - ccy) / maxR;
            if (t < DUR * 0.35) {
              const pull = Math.sin((Math.PI / 2) * (t / (DUR * 0.35)));
              const k = pull * (1.1 - d) * 0.5;
              ox = (ccx - x) * k;
              oy = (ccy - y) * k;
              hot = d < pull * 0.7;
              dim = !hot;
              // white-hot core with a red fringe
              if (hot) hotInk = d < pull * 0.35 ? THEME.bone : THEME.red;
            } else {
              const rr = ((t - DUR * 0.35) / (DUR * 0.55)) * maxR * 1.3;
              const near = Math.abs(rr - d * maxR) < cellW * 3;
              const passed = rr > d * maxR;
              hot = near;
              dim = !passed && !near;
            }
          } else if (cy.effect === "grid-waves") {
            // the word ripples like a flag, settling flat by completion
            hotInk = THEME.cyan;
            const wprog = Math.min(t, DUR * 0.85) / (DUR * 0.85);
            const amp = (1 - wprog) * cellW * 1.6;
            ox = Math.sin(y * 0.02 + t * 0.012) * amp;
            oy = Math.cos(x * 0.015 + t * 0.01) * amp * 0.6;
            hot = wprog < 0.8 && (r * 7 + c * 13 + ((t / 90) | 0)) % 8 === 0;
          } else if (cy.effect === "grid-fireworks") {
            // celebration over the resting word: staggered bursts bloom as
            // expanding rings of theme-bright blocks, then fall back to rest
            let best = 0;
            let bestColor: string | null = null;
            for (const b of cy.bursts) {
              const age = t - b.t0;
              if (age < 0 || age > 1200) continue;
              const dist = Math.hypot(x - b.x, y - b.y) / cellW;
              // ignition core: the burst origin flashes solid, then the ring
              // takes over as it expands and thins
              if (age < 300 && dist < 2.5 + (age / 1000) * 4) {
                const f = 1 - age / 300;
                if (f > best) {
                  best = f;
                  bestColor = b.color;
                }
                continue;
              }
              const rad = 2 + ((age - 300) / 1000) * 10;
              const w = Math.abs(dist - rad);
              if (w > 2.2) continue;
              const f = (1 - w / 2.2) * (1 - age / 1200);
              if (f > best) {
                best = f;
                bestColor = b.color;
              }
            }
            if (bestColor && best > 0.03) {
              flatInk = bestColor;
              flatAlpha = Math.min(1, best * 1.5);
            }
          } else if (cy.effect === "grid-colorshift") {
            // sparse shimmer over the sloshing gradient (the ink shift itself
            // lands in the draw step via shiftSteps)
            hot = (r * 7 + c * 13 + ((t / 120) | 0)) % 17 === 0;
          } else if (cy.effect === "grid-prism") {
            // chromatic sweep: white-hot core, red leading fringe, blue
            // trailing fringe; unreached cells stay dim, passed cells rest
            const dx = x - prismX;
            const core = W * 0.012;
            const fringe = W * 0.03;
            if (Math.abs(dx) < core) {
              flatInk = THEME.bone;
            } else if (dx >= core && dx < fringe) {
              flatInk = THEME.red;
            } else if (dx <= -core && dx > -fringe) {
              flatInk = THEME.blue;
            } else if (dx >= fringe) {
              dim = true;
            }
          } else {
            // grid-spotlights
            const pxx = diag(x, y);
            const bands = [bandX(0), bandX(0.22)];
            const inside = bands.some((b) => Math.abs(b - pxx) < W * 0.07);
            const passed = bands.some((b) => b > pxx);
            hot = inside;
            dim = !passed && !inside;
          }
        }

        // resting translucency: the word always sits ghostly, dissolving
        // across its own lit extent — left present, right gone. Eased so
        // the dissolve bites harder toward the edge. Shadows fade too.
        const fadeK = Math.min(1, Math.max(0, (c - minLitCol) / Math.max(1, maxLitCol - minLitCol)));
        const fadeA = fadeOn ? restFade - (restFade - restGhost) * Math.pow(fadeK, 1.4) : 1;

        // the light lifts the word too
        const lifted = glow > 0.15;

        // voxel relief: the same pixels stamped up-right in two stacked
        // dark-slate steps behind the face — chunky depth that stays glued
        // to the letters through every effect frame. Builds only against
        // open sky, never inside counters. Cipher frontiers float
        // shadowless (cleaner); dormant cells keep only a faint ghost.
        if (extrudeOn && !hot) {
          const near = (dim && !lifted ? 0.3 : 0.92) * fadeA;
          const far = (dim && !lifted ? 0.12 : 0.45) * fadeA;
          if (isSky(c + 2, r - 2)) {
            ctx.fillStyle = FIELD.extrude;
            ctx.globalAlpha = far;
            ctx.fillRect(
              x + ox + cellW * 1.6 - cellW / 2,
              y + oy - cellH * 2.0 - cellH / 2,
              cellW + 0.5,
              cellH + 0.5
            );
          }
          if (isSky(c + 1, r - 1)) {
            ctx.fillStyle = FIELD.extrudeNear;
            ctx.globalAlpha = near;
            ctx.fillRect(
              x + ox + cellW * 0.8 - cellW / 2,
              y + oy - cellH * 1.0 - cellH / 2,
              cellW + 0.5,
              cellH + 0.5
            );
          }
        }

        if (hot && !holding && glow <= 0.15) {
          // disturbance frontier: hot cipher glyphs over the word, each
          // effect wearing its own theme ink
          ctx.fillStyle = hotInk;
          ctx.globalAlpha = 1;
          ctx.fillText(cy.scratch[i], x + ox, y + oy);
        } else {
          // resting ink wears the current effect's own palette (flat label
          // tone wins when one is set); colorshift sloshes through its bands
          const baseInk =
            restFlat ??
            palInk(
              STOP_SETS[cy.effect],
              cy.effect === "grid-colorshift" && !holding
                ? (bandOfRow[r] + shiftSteps + 38) % WORDMARK_BAND_ROWS
                : bandOfRow[r]
            );
          ctx.fillStyle = lifted ? (glow > 0.45 ? FIELD.crest : FIELD.hover) : (flatInk ?? baseInk);
          // frosted-glass rest: merged translucent fill with column-coherent
          // brushed streaks plus a whisper of per-cell grain — the load
          // animation's look. Grout tiles only when explicitly opted in.
          const grout = restGrout;
          const varied = grout ? cubeCell[i] : fadeOn ? streakCol[c] * grainCell[i] : 1;
          const restA = (flatAlpha ?? (dim && !lifted ? 0.45 : 1)) * fadeA * varied;
          ctx.globalAlpha = restA;
          drawRest(x + ox, y + oy, i, grout);
          // frosted strike: re-lay the same cell additively so settled
          // letters carry their own light, like the load wave just passed.
          // Brighter columns strike brighter — the brushing gains contrast.
          if (fadeOn && !grout && !lifted) {
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = restA * 0.5;
            ctx.fillRect(x + ox - cellW / 2, y + oy - cellH / 2, cellW + 0.5, cellH + 0.5);
            ctx.globalCompositeOperation = "source-over";
          }
          // top-face light: a cream lip hugging the top edge of every
          // skyline cell. It overlaps the face (never the air above), so
          // inner edges — notches, open bowls — read as bevels, never bars.
          if (extrudeOn && !hot && isSky(c, r - 1)) {
            ctx.fillStyle = FIELD.extrudeTop;
            ctx.globalAlpha = (dim && !lifted ? 0.3 : 0.92) * fadeA * 0.85;
            ctx.fillRect(x + ox - cellW / 2, y + oy - cellH / 2, cellW + 0.5, cellH * 0.45);
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    // the load animation's glow, frozen: a soft elliptical wash hugging
    // the lit extent, so the word keeps its luminous breathing at rest.
    // Plain source-over inside a feathered margin — the gradient reaches 0
    // well before the fill edge, so no boundary can ever print. One fill
    // per frame, no shadowBlur, no perf cost.
    if (restSheen > 0 && maxLitCol >= minLitCol && maxLitRow >= minLitRow) {
      const bcx = ((minLitCol + maxLitCol + 1) / 2) * cellW;
      const bcy = ((minLitRow + maxLitRow + 1) / 2) * cellH;
      const brx = ((maxLitCol - minLitCol + 1) / 2) * cellW;
      const bry = ((maxLitRow - minLitRow + 1) / 2) * cellH;
      const m = 1.4; // feather margin around the zero contour
      if (!sheenGrad || sheenAmt !== restSheen) {
        sheenAmt = restSheen;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1 / m);
        g.addColorStop(0, `rgba(201,220,192,${0.15 * restSheen})`);
        g.addColorStop(0.6, `rgba(201,220,192,${0.06 * restSheen})`);
        g.addColorStop(1, "rgba(201,220,192,0)");
        sheenGrad = g;
      }
      ctx.save();
      ctx.translate(bcx, bcy);
      ctx.scale(Math.max(brx * m, 1), Math.max(bry * m, 1));
      ctx.fillStyle = sheenGrad;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }

    if (cy.effect === "grid-beams" && !holding && beamX > -0.15 * W && beamX < 1.15 * W) {
      const grad = ctx.createLinearGradient(beamX - 34, 0, beamX + 34, 0);
      grad.addColorStop(0, "rgba(198,255,94,0)");
      grad.addColorStop(0.5, "rgba(198,255,94,0.22)");
      grad.addColorStop(1, "rgba(198,255,94,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(beamX - 34, 0, 68, H);
    }
    if (cy.effect === "grid-laser" && !holding && laserY > -0.1 * H && laserY < 1.1 * H) {
      const grad = ctx.createLinearGradient(0, laserY - 30, 0, laserY + 30);
      grad.addColorStop(0, "rgba(245,242,236,0)");
      grad.addColorStop(0.5, "rgba(245,242,236,0.25)");
      grad.addColorStop(1, "rgba(245,242,236,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, laserY - 30, W, 60);
    }
  };
  raf = requestAnimationFrame(frame);

  const cleanup = () => {
    dead = true;
    cancelAnimationFrame(raf);
    host?.removeEventListener("pointermove", onMove);
    host?.removeEventListener("pointerleave", onLeave);
  };
  return cleanup;
}
